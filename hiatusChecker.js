import { google } from "googleapis";

// Store last checked state to avoid duplicate notifications
const notifiedUsers = new Set();

export function startHiatusChecker(client) {
    console.log('⏰ Hiatus Checker started');

    // Check every hour
    setInterval(async () => {
        await checkHiatusExpiration(client);
    }, 60 * 60 * 1000); // Every hour

    // Also run immediately on startup
    checkHiatusExpiration(client);
}

async function checkHiatusExpiration(client) {
    try {
        console.log('🔍 Checking hiatus expirations...');

        // ====== Setup Google Sheets ======
        const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
        const auth = new google.auth.GoogleAuth({
            credentials: creds,
            scopes: ['https://www.googleapis.com/auth/spreadsheets']
        });

        const authClient = await auth.getClient();
        const sheets = google.sheets({ version: 'v4', auth: authClient });

        const spreadsheetId = process.env.SHEET_ID;
        const sheetName = 'Members';

        // ====== Get hiatus data (columns M to Q) ======
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `${sheetName}!M:Q`
        });

        const rows = response.data.values || [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const updatesToMake = [];
        const usersToNotify = [];

        // Check each hiatus entry (starting from row 3, index 2)
        for (let i = 2; i < rows.length; i++) {
            const row = rows[i];
            if (!row || !row[0]) continue; // Skip empty rows

            const username = row[0]; // Column M
            const startDate = row[1]; // Column N
            const endDate = row[2]; // Column O
            const daysRemaining = parseInt(row[3]) || 0; // Column P
            const reason = row[4]; // Column Q

            if (!endDate) continue;

            // Calculate new days remaining
            const end = new Date(endDate);
            end.setHours(0, 0, 0, 0);
            const newDaysRemaining = Math.ceil((end - today) / (1000 * 60 * 60 * 24));

            // Update days remaining if it changed
            if (newDaysRemaining !== daysRemaining) {
                updatesToMake.push({
                    range: `${sheetName}!P${i + 1}`,
                    values: [[newDaysRemaining]]
                });
            }

            // Check if hiatus has ended (days remaining is 0 or negative)
            if (newDaysRemaining <= 0) {
                const notificationKey = `${username}_${endDate}`;
                
                // Only notify if we haven't already notified for this hiatus
                if (!notifiedUsers.has(notificationKey)) {
                    usersToNotify.push({
                        username,
                        rowNumber: i + 1
                    });
                    notifiedUsers.add(notificationKey);
                }
            }
        }

        // ====== Update days remaining ======
        if (updatesToMake.length > 0) {
            await sheets.spreadsheets.values.batchUpdate({
                spreadsheetId,
                requestBody: {
                    valueInputOption: 'RAW',
                    data: updatesToMake
                }
            });
            console.log(`📊 Updated ${updatesToMake.length} hiatus day counters`);
        }

        // ====== Process expired hiatus ======
        for (const userData of usersToNotify) {
            await processExpiredHiatus(client, sheets, spreadsheetId, sheetName, userData.username, userData.rowNumber);
        }

        if (usersToNotify.length > 0) {
            console.log(`✅ Processed ${usersToNotify.length} expired hiatus entries`);
        }

    } catch (error) {
        console.error('❌ Error checking hiatus expiration:', error);
    }
}

async function processExpiredHiatus(client, sheets, spreadsheetId, sheetName, username, rowNumber) {
    try {
        console.log(`⏰ Processing expired hiatus for ${username}`);

        // Find the hiatus notice channel
        const hiatusChannel = client.channels.cache.find(
            ch => ch.name === '📝〢hiatus・notice' && ch.isTextBased()
        );

        if (!hiatusChannel) {
            console.error('❌ Hiatus notice channel not found!');
            return;
        }

        // Find the user in the guild
        const guild = client.guilds.cache.first();
        if (!guild) {
            console.error('❌ No guild found!');
            return;
        }

        // Search for member by username
        await guild.members.fetch();
        const member = guild.members.cache.find(m => m.user.username === username);

        if (member) {
            // Remove (hiatus) from nickname
            const currentNick = member.nickname || member.user.username;
            const newNick = currentNick.replace(/\s*\(hiatus\)\s*/gi, '').trim();
            
            try {
                await member.setNickname(newNick || null);
            } catch (nickError) {
                console.error('Error removing hiatus from nickname:', nickError);
            }

            // Send notification
            await hiatusChannel.send({
                content: `${member} ur hiatus is done`,
                allowedMentions: { parse: ['users'] }
            });
        } else {
            // User not found, still notify with username
            await hiatusChannel.send({
                content: `@${username} ur hiatus is done`,
                allowedMentions: { parse: [] }
            });
        }

        // ====== Move user back to inactive section ======
        // Get the user's role from the Members sheet to determine which column
        const allDataResponse = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `${sheetName}!A:Q`
        });

        const allRows = allDataResponse.data.values || [];
        
        // Determine which role the user should be in
        // We'll put them in the first inactive column (G) by default
        // You can modify this logic based on your needs
        
        // Find first empty row in column G (inactive section)
        let targetRow = 3;
        for (let i = 2; i < allRows.length + 10; i++) {
            const colGValue = allRows[i] ? allRows[i][6] : ''; // Column G (index 6)
            if (!colGValue || colGValue.trim() === '') {
                targetRow = i + 1;
                break;
            }
        }

        // Batch update: Move to inactive and clear hiatus row
        await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId,
            requestBody: {
                valueInputOption: 'RAW',
                data: [
                    {
                        range: `${sheetName}!G${targetRow}`,
                        values: [[username]]
                    },
                    {
                        range: `${sheetName}!M${rowNumber}:Q${rowNumber}`,
                        values: [['', '', '', '', '']] // Clear the hiatus row
                    }
                ]
            }
        });

        console.log(`✅ Moved ${username} back to inactive section`);

    } catch (error) {
        console.error(`❌ Error processing expired hiatus for ${username}:`, error);
    }
}

// Export for manual trigger if needed
export async function manualCheckHiatus(client) {
    await checkHiatusExpiration(client);
}
