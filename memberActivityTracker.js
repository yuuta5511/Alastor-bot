import { google } from "googleapis";

// ====== Member Activity Tracker ======
// Tracks member messages and updates Google Sheets

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

// Store last message dates in memory
const memberLastMessage = new Map();

export function startMemberTracking(client) {
    console.log('👥 Member Activity Tracker started');

    // Track messages
    client.on('messageCreate', async (message) => {
        // Ignore bot messages
        if (message.author.bot) return;
        
        // Update last message time for this user
        memberLastMessage.set(message.author.id, new Date());
        
        console.log(`📝 Tracked message from ${message.author.tag}`);
    });

    // Update sheet every hour
    setInterval(async () => {
        await updateMembersSheet(client);
    }, 60 * 60 * 1000); // Every hour

    // Also update on bot ready
    client.once('ready', async () => {
        console.log('📊 Running initial members sheet update...');
        await updateMembersSheet(client);
    });
}

async function updateMembersSheet(client) {
    try {
        console.log('🔄 Updating Members sheet...');

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

            // Get last message date
            const lastMessageDate = memberLastMessage.get(memberId);
            
            // Determine if active or inactive
            const isActive = lastMessageDate && lastMessageDate > fourDaysAgo;

            // Add to appropriate category
            const username = member.user.username;
            if (isActive) {
                categorized.active[memberRole].push(username);
            } else {
                categorized.inactive[memberRole].push(username);
            }
        }

        // ====== Clear existing data (from row 3 onwards) ======
        // First, get the sheet to find max rows
        const sheetData = await sheets.spreadsheets.get({
            spreadsheetId,
            ranges: [sheetName]
        });

        const maxRows = sheetData.data.sheets[0].properties.gridProperties.rowCount;

        // Clear from row 3 to end
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

    } catch (error) {
        console.error('❌ Error updating Members sheet:', error);
    }
}

// Export function to manually trigger update (can be called from slash command)
export async function manualUpdateMembers(client) {
    await updateMembersSheet(client);
}
