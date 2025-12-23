import { google } from "googleapis";

// ====== GOOGLE SHEET SETUP ======
const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);

const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
});

const sheetsClient = await auth.getClient();
const sheets = google.sheets({ version: "v4", auth: sheetsClient });

const spreadsheetId = process.env.SHEET_ID;
const configSheetName = "Config 2";

// ====== FUNCTION TO UPDATE CHANNELS IN SHEET ======
export async function updateChannelsInSheet(client) {
    try {
        console.log('📋 Updating channels list in sheet...');
        
        // Get all channels from the guild
        const guild = client.guilds.cache.first();
        if (!guild) {
            console.error("❌ No guild found!");
            return;
        }

        // Get all text channels and sort them by rawPosition (Discord's actual order)
        const channels = guild.channels.cache
            .filter(channel => channel.type === 0) // 0 = Text Channel
            .sort((a, b) => a.rawPosition - b.rawPosition) // Sort by Discord's visual order
            .map(channel => [channel.name, channel.id]);

        // Add header row
        const dataToWrite = [
            ["Channel Name", "Channel ID"],
            ...channels
        ];

        // Clear existing data first
        await sheets.spreadsheets.values.clear({
            spreadsheetId,
            range: `${configSheetName}!A:B`
        });

        // Write new data
        await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: `${configSheetName}!A1`,
            valueInputOption: "RAW",
            resource: {
                values: dataToWrite
            }
        });

        console.log(`✅ Successfully updated ${channels.length} channels in sheet!`);
    } catch (error) {
        console.error("❌ Error updating channels in sheet:", error);
    }
}

// ====== START CHANNEL TRACKER ======
export function startChannelTracker(client) {
    console.log('🔄 Starting channel tracker...');
    
    // Run immediately
    updateChannelsInSheet(client);
    
    // Update channels list every 10 minutes
    setInterval(() => {
        updateChannelsInSheet(client);
    }, 10 * 60 * 1000); // 10 minutes
    
    // Update when a channel is created
    client.on('channelCreate', (channel) => {
        console.log(`📢 New channel created: ${channel.name}`);
        updateChannelsInSheet(client);
    });
    
    // Update when a channel is deleted
    client.on('channelDelete', (channel) => {
        console.log(`🗑️ Channel deleted: ${channel.name}`);
        updateChannelsInSheet(client);
    });
    
    // Update when a channel is updated (name change, etc.)
    client.on('channelUpdate', (oldChannel, newChannel) => {
        if (oldChannel.name !== newChannel.name) {
            console.log(`✏️ Channel renamed: ${oldChannel.name} → ${newChannel.name}`);
            updateChannelsInSheet(client);
        }
    });
}
