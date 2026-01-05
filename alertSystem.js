// alertSystem.js - Monitor work progress and send alerts for late work
import { google } from 'googleapis';

const OLD_SHEET_ID = '1CKbgNt7yMMm3H_s6n3wxKVrDcedyEdZHDjKFUGFLlLU';
const WORKING_NOW_PAGE = 'Working now';
const ADMIN_ROLE_ID = '1269706276309569581';

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

// Track which works have been alerted
const alertedWorks = new Map(); // Key: "username-channelId-chapter", Value: { sixHour: bool, twelveHour: bool }

// ====== Helper: Get Hours Since Timestamp ======
function getHoursSince(timestamp) {
    try {
        const past = new Date(timestamp);
        const now = new Date();
        const diffMs = now - past;
        const hours = diffMs / (1000 * 60 * 60);
        return hours;
    } catch (error) {
        return 0;
    }
}

// ====== Helper: Check and Alert Late Work ======
async function checkLateWork(client) {
    try {
        const response = await sheetsClient.spreadsheets.values.get({
            spreadsheetId: OLD_SHEET_ID,
            range: `${WORKING_NOW_PAGE}!A:G`
        });

        const rows = response.data.values || [];

        for (const row of rows) {
            const username = row[0]?.trim();
            const seriesName = row[1]?.trim();
            const chapter = row[2]?.toString().trim();
            const role = row[3]?.trim();
            const timestamp = row[4]?.trim();
            const channelId = row[5]?.trim();
            const userId = row[6]?.trim(); // Column G - User ID

            if (!username || !timestamp || !channelId) continue;

            const hoursSince = getHoursSince(timestamp);
            const workKey = `${username}-${channelId}-${chapter}`;

            // Initialize alert tracking for this work if not exists
            if (!alertedWorks.has(workKey)) {
                alertedWorks.set(workKey, { sixHour: false, twelveHour: false });
            }

            const alerts = alertedWorks.get(workKey);

            // Check for 6-hour alert
            if (hoursSince >= 6 && !alerts.sixHour) {
                await sendLateAlert(client, channelId, username, userId, seriesName, chapter, role, 6);
                alerts.sixHour = true;
                alertedWorks.set(workKey, alerts);
            }

            // Check for 12-hour alert
            if (hoursSince >= 12 && !alerts.twelveHour) {
                await sendLateAlert(client, channelId, username, userId, seriesName, chapter, role, 12);
                alerts.twelveHour = true;
                alertedWorks.set(workKey, alerts);
            }
        }

        // Clean up alertedWorks Map for completed works
        cleanupAlertMap(rows);

    } catch (error) {
        console.error('Error checking late work:', error);
    }
}

// ====== Helper: Clean Up Alert Map ======
function cleanupAlertMap(currentRows) {
    const currentWorkKeys = new Set();
    
    for (const row of currentRows) {
        const username = row[0]?.trim();
        const chapter = row[2]?.toString().trim();
        const channelId = row[5]?.trim();
        
        if (username && chapter && channelId) {
            currentWorkKeys.add(`${username}-${channelId}-${chapter}`);
        }
    }

    // Remove entries that are no longer in Working now sheet
    for (const key of alertedWorks.keys()) {
        if (!currentWorkKeys.has(key)) {
            alertedWorks.delete(key);
        }
    }
}

// ====== Helper: Send Late Alert ======
async function sendLateAlert(client, channelId, username, userId, seriesName, chapter, role, hours) {
    try {
        const channel = client.channels.cache.get(channelId);
        
        if (!channel || !channel.isTextBased()) {
            console.error(`❌ Channel ${channelId} not found or not a text channel`);
            return;
        }

        // Use user ID for mention if available, fallback to username
        const userMention = userId ? `<@${userId}>` : `@${username}`;

        const message = hours === 6 
            ? `⚠️ **Late Work Alert** ⚠️\n\n` +
              `<@&${ADMIN_ROLE_ID}> ${userMention}\n\n` +
              `**Series:** ${seriesName}\n` +
              `**Chapter:** ${chapter}\n` +
              `**Role:** ${role}\n\n` +
              `⏰ **6 hours** have passed since work started. Please check on the progress!`
            : `🚨 **URGENT: Late Work Alert** 🚨\n\n` +
              `<@&${ADMIN_ROLE_ID}> ${userMention}\n\n` +
              `**Series:** ${seriesName}\n` +
              `**Chapter:** ${chapter}\n` +
              `**Role:** ${role}\n\n` +
              `⏰ **12 HOURS** have passed and the chapter is still not done!`;

        await channel.send({
            content: message,
            allowedMentions: { parse: ['roles', 'users'] }
        });

        console.log(`⚠️ Sent ${hours}h late alert for ${username} - ${seriesName} Ch${chapter}`);

    } catch (error) {
        console.error('Error sending late alert:', error);
    }
}

// ====== Main Function: Start Alert System ======
export function startAlertSystem(client) {
    console.log('⏰ Starting work alert system...');

    // Check every 10 minutes
    const CHECK_INTERVAL = 10 * 60 * 1000; // 10 minutes in milliseconds

    setInterval(() => {
        checkLateWork(client);
    }, CHECK_INTERVAL);

    // Initial check after 1 minute to avoid startup race conditions
    setTimeout(() => {
        checkLateWork(client);
    }, 60 * 1000);

    console.log('✅ Work alert system started (checking every 10 minutes)');
}
