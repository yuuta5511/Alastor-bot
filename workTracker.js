// workTracker.js - Track work messages and validate them
import { google } from 'googleapis';

const OLD_SHEET_ID = '1CKbgNt7yMMm3H_s6n3wxKVrDcedyEdZHDjKFUGFLlLU';
const CONFIG_PAGE = 'Config';
const WORKING_NOW_PAGE = 'Working now';
const LOG_PAGE = 'Log';
const PROGRESS_PAGE = 'PROGRESS';
const WORK_TRACKING_CHANNEL_ID = '1456411501047840821';

const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
});

let sheetsClient;
(async () => {
    const client = await auth.getClient();
    sheetsClient = google.sheets({ version: 'v4', auth: client });
})();

// ====== Helper: Get Channel ID and Series Info from Config ======
async function getSeriesInfoFromChannelMention(channelMention) {
    try {
        // Extract channel ID from mention (format: #channel-name or <#123456>)
        const channelIdMatch = channelMention.match(/<#(\d+)>/) || channelMention.match(/(\d+)/);
        if (!channelIdMatch) return null;

        const channelId = channelIdMatch[1];

        const response = await sheetsClient.spreadsheets.values.get({
            spreadsheetId: OLD_SHEET_ID,
            range: `${CONFIG_PAGE}!B:F`
        });

        const rows = response.data.values || [];
        
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const configChannelId = row[4]?.trim(); // Column F (index 4)
            
            if (configChannelId === channelId) {
                return {
                    channelId: channelId,
                    seriesName: row[0] || '', // Column B (index 0)
                    rowNumber: i + 1
                };
            }
        }

        return null;
    } catch (error) {
        console.error('Error getting series info:', error);
        return null;
    }
}

// ====== Helper: Check if Already in Log ======
async function isAlreadyInLog(channelId, chapterNum, role) {
    try {
        const response = await sheetsClient.spreadsheets.values.get({
            spreadsheetId: OLD_SHEET_ID,
            range: `${LOG_PAGE}!C:F`
        });

        const rows = response.data.values || [];
        const normalizedRole = role.toUpperCase();

        for (const row of rows) {
            const logChapter = row[0]?.toString().trim(); // Column C (index 0)
            const logRole = row[1]?.trim().toUpperCase(); // Column D (index 1)
            const logChannelId = row[3]?.trim(); // Column F (index 3)

            if (logChannelId === channelId && 
                logChapter === chapterNum.toString() && 
                logRole === normalizedRole) {
                return true;
            }
        }

        return false;
    } catch (error) {
        console.error('Error checking log:', error);
        return false;
    }
}

// ====== Helper: Check if Chapter is Within Valid Range (N+1 to D) ======
async function isChapterInValidRange(rowNumber, chapterNum) {
    try {
        const response = await sheetsClient.spreadsheets.values.get({
            spreadsheetId: OLD_SHEET_ID,
            range: `${PROGRESS_PAGE}!D${rowNumber}:N${rowNumber}`
        });

        const row = response.data.values?.[0] || [];
        const rawProgress = parseInt(row[0] || 0); // Column D
        const edProgress = parseInt(row[10] || 0); // Column N

        // Chapter must be between ED+1 and RAW (inclusive)
        const minChapter = edProgress + 1;
        const maxChapter = rawProgress;

        return chapterNum >= minChapter && chapterNum <= maxChapter;
    } catch (error) {
        console.error('Error checking chapter range:', error);
        return false;
    }
}

// ====== Helper: Check if Someone is Already Working on This Chapter ======
async function isSomeoneWorkingOnChapter(channelId, chapterNum, role) {
    try {
        const response = await sheetsClient.spreadsheets.values.get({
            spreadsheetId: OLD_SHEET_ID,
            range: `${WORKING_NOW_PAGE}!C:F`
        });

        const rows = response.data.values || [];
        const normalizedRole = role.toUpperCase();

        for (const row of rows) {
            const workChapter = row[0]?.toString().trim(); // Column C (index 0)
            const workRole = row[1]?.trim().toUpperCase(); // Column D (index 1)
            const workChannelId = row[3]?.trim(); // Column F (index 3)

            if (workChannelId === channelId && 
                workChapter === chapterNum.toString() && 
                workRole === normalizedRole) {
                return true;
            }
        }

        return false;
    } catch (error) {
        console.error('Error checking working now:', error);
        return false;
    }
}

// ====== Helper: Add Work to "Working now" Sheet ======
async function addToWorkingNow(username, userId, seriesName, chapterNum, role, timestamp, channelId) {
    try {
        const rowData = [
            username,           // Column A
            seriesName,         // Column B
            chapterNum,         // Column C
            role.toUpperCase(), // Column D
            timestamp,          // Column E
            channelId,          // Column F
            userId              // Column G - User ID
        ];

        await sheetsClient.spreadsheets.values.append({
            spreadsheetId: OLD_SHEET_ID,
            range: `${WORKING_NOW_PAGE}!A:G`,
            valueInputOption: 'RAW',
            insertDataOption: 'INSERT_ROWS',
            requestBody: {
                values: [rowData]
            }
        });

        console.log(`✅ Added work to "Working now": ${username} - ${seriesName} Ch${chapterNum} (${role})`);
        return true;
    } catch (error) {
        console.error('Error adding to Working now:', error);
        return false;
    }
}

// ====== Main Function: Start Tracking Work Messages ======
export function startWorkTracker(client) {
    console.log('📝 Starting work tracker...');

    client.on('messageCreate', async (message) => {
        // Ignore bots and check if it's the work tracking channel
        if (message.author.bot || message.channelId !== WORK_TRACKING_CHANNEL_ID) return;

        const content = message.content.trim();
        
        // Parse message format: #channel-name role chapterNumber
        // Example: #example-room ed 12
        const pattern = /^(<#\d+>|#[\w-]+)\s+(ed|ktl|jtl|ctl|pr)\s+(\d+)$/i;
        const match = content.match(pattern);

        if (!match) return; // Not a valid work tracking message

        const channelMention = match[1];
        const role = match[2].toUpperCase();
        const chapterNum = parseInt(match[3]);

        console.log(`📝 Work message detected: ${channelMention} ${role} ${chapterNum} by ${message.author.username}`);

        try {
            // Get series info from channel mention
            const seriesInfo = await getSeriesInfoFromChannelMention(channelMention);
            
            if (!seriesInfo) {
                console.log(`❌ Channel not found in Config sheet`);
                await message.react('❌');
                return;
            }

            // Check if chapter is within valid range (N+1 to D)
            const isInRange = await isChapterInValidRange(seriesInfo.rowNumber, chapterNum);
            if (!isInRange) {
                console.log(`❌ Chapter ${chapterNum} is not in valid range (ED+1 to RAW)`);
                await message.react('❌');
                return;
            }

            // Check if someone is already working on this chapter
            const alreadyWorking = await isSomeoneWorkingOnChapter(seriesInfo.channelId, chapterNum, role);
            if (alreadyWorking) {
                console.log(`❌ Someone is already working on: ${seriesInfo.seriesName} Ch${chapterNum} (${role})`);
                await message.react('❌');
                return;
            }

            // Check if already in log
            const alreadyLogged = await isAlreadyInLog(seriesInfo.channelId, chapterNum, role);
            if (alreadyLogged) {
                console.log(`❌ Work already logged: ${seriesInfo.seriesName} Ch${chapterNum} (${role})`);
                await message.react('❌');
                return;
            }

            // Add to "Working now" sheet
            const timestamp = new Date().toISOString();
            const added = await addToWorkingNow(
                message.author.username,
                seriesInfo.seriesName,
                chapterNum,
                role,
                timestamp,
                seriesInfo.channelId
            );

            if (added) {
                await message.react('✅');
                console.log(`✅ Work accepted: ${message.author.username} - ${seriesInfo.seriesName} Ch${chapterNum} (${role})`);
            } else {
                await message.react('❌');
            }

        } catch (error) {
            console.error('Error processing work message:', error);
            await message.react('❌');
        }
    });

    console.log('✅ Work tracker started successfully');
}

export { sheetsClient as workSheetsClient };
