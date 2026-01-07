import { google } from "googleapis";

// ====== Member Activity Tracker (Based on Log Submissions) ======
// Tracks member submissions from Log sheet and updates Google Sheets

const OLD_SHEET_ID = '1CKbgNt7yMMm3H_s6n3wxKVrDcedyEdZHDjKFUGFLlLU';
const LOG_PAGE = 'Log';

const ROLE_IDS = {
    'ED': '1269706276288467057',
    'PR': '1269706276288467058',
    'KTL': '1270089817517981859',
    'JTL': '1288004879020724276',
    'CTL': '1269706276288467059'
};

// Column mapping for active members (last 4 days)
const ACTIVE_COLUMNS = {
    'ED': 'A',
    'PR': 'B',
    'KTL': 'C',
    'JTL': 'D',
    'CTL': 'E'
};

// Column mapping for inactive members (over 4 days)
const INACTIVE_COLUMNS = {
    'ED': 'G',
    'PR': 'H',
    'KTL': 'I',
    'JTL': 'J',
    'CTL': 'K'
};

export function startMemberTracking(client) {
    console.log('💥 Member Activity Tracker started (Log-based)');

    // Update sheet every hour
    setInterval(async () => {
        await updateMembersSheet(client);
    }, 60 * 60 * 1000); // Every hour
}

async function updateMembersSheet(client) {
    try {
        console.log('📄 Updating Members sheet based on Log submissions...');

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

        // ====== Get hiatus list (Column M) to exclude from tracking ======
        const hiatusResponse = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `${sheetName}!M:M`
        });

        const hiatusRows = hiatusResponse.data.values || [];
        const hiatusUsernames = new Set();
        
        // Start from row 3 (index 2) to skip headers
        for (let i = 2; i < hiatusRows.length; i++) {
            if (hiatusRows[i] && hiatusRows[i][0]) {
                hiatusUsernames.add(hiatusRows[i][0]);
            }
        }

        console.log(`📋 Found ${hiatusUsernames.size} users on hiatus - excluding from tracking`);

        // ====== Get Log data to track last submission dates ======
        const logResponse = await sheets.spreadsheets.values.get({
            spreadsheetId: OLD_SHEET_ID,
            range: `${LOG_PAGE}!A:E`
        });

        const logRows = logResponse.data.values || [];
        const lastSubmissions = new Map(); // username -> last submission date

        // Process log entries (skip header row if exists)
        for (let i = 1; i < logRows.length; i++) {
            const row = logRows[i];
            if (!row[0] || !row[4]) continue; // Need username (A) and date (E)

            const username = row[0].trim();
            const dateStr = row[4].trim();

            try {
                const submissionDate = new Date(dateStr);
                
                // Keep only the most recent submission per user
                if (!lastSubmissions.has(username) || submissionDate > lastSubmissions.get(username)) {
                    lastSubmissions.set(username, submissionDate);
                }
            } catch (error) {
                console.error(`Error parsing date for ${username}: ${dateStr}`);
            }
        }

        console.log(`📊 Processed ${lastSubmissions.size} unique users from Log`);

        // Get all guilds (servers) the bot is in
        const guild = client.guilds.cache.first();
        if (!guild) {
            console.error('❌ No guild found!');
            return;
        }

        // Fetch all members
        await guild.members.fetch();

        // Categorize members by role and activity
        const categorized = {
            active: { ED: [], PR: [], KTL: [], JTL: [], CTL: [] },
            inactive: { ED: [], PR: [], KTL: [], JTL: [], CTL: [] }
        };

        const fourDaysAgo = new Date();
        fourDaysAgo.setDate(fourDaysAgo.getDate() - 4);

        // Process each member
        for (const [memberId, member] of guild.members.cache) {
            // Skip bots
            if (member.user.bot) continue;

            const username = member.user.username;

            // ⭐ SKIP IF USER IS ON HIATUS ⭐
            if (hiatusUsernames.has(username)) {
                console.log(`⏭️ Skipping ${username} - on hiatus`);
                continue;
            }

            // Check which role they have (check in order of priority)
            let memberRole = null;
            for (const [roleName, roleId] of Object.entries(ROLE_IDS)) {
                if (member.roles.cache.has(roleId)) {
                    memberRole = roleName;
                    break; // Take first matching role
                }
            }

            // Skip if member doesn't have any tracked role
            if (!memberRole) continue;

            // Get last submission date from Log
            const lastSubmissionDate = lastSubmissions.get(username);
            
            // Determine if active or inactive based on last submission
            const isActive = lastSubmissionDate && lastSubmissionDate > fourDaysAgo;

            // Add to appropriate category
            if (isActive) {
                categorized.active[memberRole].push(username);
            } else {
                categorized.inactive[memberRole].push(username);
            }
        }

        // ====== Clear existing data (from row 3 onwards) ======
        const sheetData = await sheets.spreadsheets.get({
            spreadsheetId,
            ranges: [sheetName]
        });

        const maxRows = sheetData.data.sheets[0].properties.gridProperties.rowCount;

        // Clear from row 3 to end (only columns A-K, not hiatus columns M-Q)
        await sheets.spreadsheets.values.clear({
            spreadsheetId,
            range: `${sheetName}!A3:K${maxRows}`
        });

        // ====== Write data to sheet ======
        const updates = [];

        // Write active members (columns A-E)
        for (const [roleName, members] of Object.entries(categorized.active)) {
            const column = ACTIVE_COLUMNS[roleName];
            if (members.length > 0) {
                const values = members.map(username => [username]);
                updates.push({
                    range: `${sheetName}!${column}3:${column}${3 + members.length - 1}`,
                    values: values
                });
            }
        }

        // Write inactive members (columns G-K)
        for (const [roleName, members] of Object.entries(categorized.inactive)) {
            const column = INACTIVE_COLUMNS[roleName];
            if (members.length > 0) {
                const values = members.map(username => [username]);
                updates.push({
                    range: `${sheetName}!${column}3:${column}${3 + members.length - 1}`,
                    values: values
                });
            }
        }

        // Batch update
        if (updates.length > 0) {
            await sheets.spreadsheets.values.batchUpdate({
                spreadsheetId,
                requestBody: {
                    valueInputOption: 'RAW',
                    data: updates
                }
            });
        }

        console.log('✅ Members sheet updated successfully!');
        console.log(`📊 Active members: ${Object.values(categorized.active).flat().length}`);
        console.log(`📊 Inactive members: ${Object.values(categorized.inactive).flat().length}`);
        console.log(`📊 On hiatus: ${hiatusUsernames.size}`);

    } catch (error) {
        console.error('❌ Error updating Members sheet:', error);
    }
}

// Export function to manually trigger update
export async function manualUpdateMembers(client) {
    await updateMembersSheet(client);
}
