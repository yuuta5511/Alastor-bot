
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
        const usersToNotify = [];

        // Check each hiatus entry (starting from row 3, index 2)
        for (let i = 2; i < rows.length; i++) {
            const row = rows[i];
            if (!row || !row[0]) continue; // Skip empty rows

            const username = row[0]; // Column M
            const startDate = row[1]; // Column N
            const endDate = row[2]; // Column O
            const daysRemaining = row[3]; // Column P (formula result)
            const reason = row[4]; // Column Q

            // Skip if no username or end date
            if (!username || !endDate) {
                console.log(`⏭️ Skipping row ${i + 1}: missing username or end date`);
                continue;
            }

            // ⭐ IMPROVED: Parse days remaining with better handling
            let daysLeft;
            
            if (daysRemaining === undefined || daysRemaining === null || daysRemaining === '') {
                console.log(`⏭️ Skipping ${username}: days remaining is empty`);
                continue;
            }
            
            if (typeof daysRemaining === 'number') {
                daysLeft = daysRemaining;
            } else if (typeof daysRemaining === 'string') {
                // Handle string values including "0"
                const trimmed = daysRemaining.trim();
                daysLeft = parseFloat(trimmed);
                
                if (isNaN(daysLeft)) {
                    console.log(`⏭️ Skipping ${username}: invalid days remaining value "${trimmed}"`);
                    continue;
                }
            } else {
                console.log(`⏭️ Skipping ${username}: unexpected type for days remaining`);
                continue;
            }

            console.log(`📊 ${username}: ${daysLeft} days remaining`);

            // ⭐ Check if hiatus has ended (days remaining is 0 or negative)
            if (daysLeft <= 0) {
                const notificationKey = `${username}_${endDate}`;
                
                // Only notify if we haven't already notified for this hiatus
                if (!notifiedUsers.has(notificationKey)) {
                    console.log(`✅ Found expired hiatus: ${username} (${daysLeft} days)`);
                    usersToNotify.push({
                        username,
                        rowNumber: i + 1,
                        daysLeft
                    });
                    notifiedUsers.add(notificationKey);
                } else {
                    console.log(`⏭️ Already notified: ${username}`);
                }
            }
        }

        // ====== Process expired hiatus ======
        if (usersToNotify.length > 0) {
            console.log(`📢 Processing ${usersToNotify.length} expired hiatus entries...`);
            for (const userData of usersToNotify) {
                await processExpiredHiatus(client, sheets, spreadsheetId, sheetName, userData.username, userData.rowNumber);
            }
            console.log(`✅ Processed ${usersToNotify.length} expired hiatus entries`);
        } else {
            console.log('ℹ️ No expired hiatus entries found');
        }

    } catch (error) {
        console.error('❌ Error checking hiatus expiration:', error);
    }
}

async function processExpiredHiatus(client, sheets, spreadsheetId, sheetName, username, rowNumber) {
    try {
        console.log(`⏰ Processing expired hiatus for ${username} (row ${rowNumber})`);

        // Find the hiatus notice channel
        const hiatusChannel = client.channels.cache.find(
            ch => ch.name === '📝〢hiatus・notice' && ch.isTextBased()
        );

        if (!hiatusChannel) {
            console.error('❌ Hiatus notice channel (📝〢hiatus・notice) not found!');
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
            const currentNick = member.nickname || member.displayName;
            const newNick = currentNick.replace(/\s*\(hiatus\)\s*/gi, '').trim();
            
            try {
                await member.setNickname(newNick || null);
                console.log(`✅ Removed (hiatus) from ${username}'s nickname`);
            } catch (nickError) {
                console.error('⚠️ Error removing hiatus from nickname:', nickError);
            }

            // Send notification with mention
            await hiatusChannel.send({
                content: `${member} ur hiatus is done`,
                allowedMentions: { parse: ['users'] }
            });
            console.log(`📢 Sent notification to ${username}`);
        } else {
            // User not found, still notify with username
            await hiatusChannel.send({
                content: `@${username} ur hiatus is done`,
                allowedMentions: { parse: [] }
            });
            console.log(`📢 Sent notification for ${username} (not found in server)`);
        }

        // ====== Find first empty row in inactive column G ======
        const inactiveResponse = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `${sheetName}!G:G`
        });

        const columnGData = inactiveResponse.data.values || [];
        let targetRow = 3; // Start from row 3
        
        for (let i = 2; i < columnGData.length + 10; i++) {
            const cellValue = columnGData[i] ? columnGData[i][0] : '';
            if (!cellValue || cellValue.trim() === '') {
                targetRow = i + 1;
                break;
            }
        }

        // ====== Move user back to inactive and clear hiatus row (SKIP COLUMN P) ======
        // ⭐ IMPORTANT: Clear hiatus row FIRST before adding to inactive
        await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId,
            requestBody: {
                valueInputOption: 'RAW',
                data: [
                    {
                        // Clear M, N, O (skip P to preserve formula)
                        range: `${sheetName}!M${rowNumber}:O${rowNumber}`,
                        values: [['', '', '']]
                    },
                    {
                        // Clear Q separately
                        range: `${sheetName}!Q${rowNumber}`,
                        values: [['']]
                    }
                ]
            }
        });

        console.log(`🗑️ Cleared hiatus data from row ${rowNumber}`);

        // ⭐ Wait a moment to ensure sheet updates
        await new Promise(resolve => setTimeout(resolve, 1000));

        // ⭐ Now add to inactive column
        await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: `${sheetName}!G${targetRow}`,
            valueInputOption: 'RAW',
            requestBody: {
                values: [[username]]
            }
        });

        console.log(`✅ Moved ${username} back to inactive section (row ${targetRow})`);
        console.log(`⚠️ Column P formula preserved for future use`);

    } catch (error) {
        console.error(`❌ Error processing expired hiatus for ${username}:`, error);
    }
}

// Export for manual trigger if needed
export async function manualCheckHiatus(client) {
    console.log('🔍 Manual hiatus check triggered');
    await checkHiatusExpiration(client);
}
