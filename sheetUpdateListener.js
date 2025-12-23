import express from "express";
import { Client, GatewayIntentBits } from "discord.js";
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
const configSheetName = "Config";

// ====== DISCORD CLIENT FOR SHEET UPDATES ======
const updateClient = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

const token = process.env.BOT_TOKEN?.trim();
if (!token) {
    console.error("❌ BOT_TOKEN missing for sheet update listener!");
    process.exit(1);
}

updateClient.login(token)
    .then(() => console.log(`✅ Sheet Update Listener logged in as ${updateClient.user.tag}`))
    .catch(err => {
        console.error("❌ Sheet update listener login failed:", err);
        process.exit(1);
    });

// ====== ROLE MENTIONS ======
const roleMentions = {
    'ED': '<@&1269706276288467057>',
    'PR': '<@&1269706276288467058>',
    'KTL': '<@&1270089817517981859>',
    'CTL': '<@&1269706276288467059>',
    'JTL': '<@&1288004879020724276>',
};

// ====== FUNCTION TO GET CHANNEL ID FROM CONFIG SHEET ======
async function getChannelIdFromConfig(rowNumber) {
    try {
        // Read the Config sheet to get channel ID from column F
        const res = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `${configSheetName}!F${rowNumber}`
        });

        const channelId = res.data.values?.[0]?.[0];
        
        if (!channelId) {
            console.log(`⚠️ No channel ID found in Config!F${rowNumber}`);
            return null;
        }

        return channelId.trim();
    } catch (error) {
        console.error(`❌ Error reading channel ID from Config sheet:`, error);
        return null;
    }
}

// ====== CREATE EXPRESS APP FOR WEBHOOK ======
const app = express();
app.use(express.json());

// ====== WEBHOOK ENDPOINT ======
app.post("/sheet-update", async (req, res) => {
    try {
        const { rowNumber, oldValue, newValue } = req.body;

        // Validate input
        if (!rowNumber || oldValue === undefined || newValue === undefined) {
            return res.status(400).json({ 
                error: "Missing required fields: rowNumber, oldValue, newValue" 
            });
        }

        console.log(`📩 Received sheet update:`, { rowNumber, oldValue, newValue });

        // Get channel ID from Config sheet
        const channelId = await getChannelIdFromConfig(rowNumber);
        
        if (!channelId) {
            return res.status(404).json({ 
                error: `Channel ID not found in Config sheet row ${rowNumber}` 
            });
        }

        // Find Discord channel by ID
        const channel = updateClient.channels.cache.get(channelId);
        
        if (!channel) {
            console.log(`⚠️ Discord channel not found for ID: ${channelId}`);
            return res.status(404).json({ 
                error: `Discord channel not found for ID: ${channelId}` 
            });
        }

        // Build mentions string
        const mentions = [
            roleMentions['ED'],
            roleMentions['KTL'],
            roleMentions['PR']
        ].join(' ');

        // Calculate chapter range
        const fromChapter = parseInt(oldValue) + 1;
        const toChapter = parseInt(newValue);

        // Send message to Discord
        const message = `${mentions} ch: ${fromChapter} to ${toChapter} on drive`;
        
        await channel.send({
            content: message,
            allowedMentions: { parse: ['roles'] }
        });

        console.log(`✅ Sent notification to ${channel.name}`);

        return res.status(200).json({ 
            success: true,
            message: `Notification sent to ${channel.name}`,
            sentTo: channel.name,
            channelId: channelId,
            text: message
        });

    } catch (error) {
        console.error("❌ Error handling sheet update:", error);
        return res.status(500).json({ 
            error: "Internal server error",
            details: error.message 
        });
    }
});

// ====== HEALTH CHECK ENDPOINT ======
app.get("/health", (req, res) => {
    res.json({ 
        status: "ok",
        service: "sheet-update-listener",
        bot: updateClient.user?.tag || "not ready"
    });
});

// ====== START SERVER ======
const PORT = process.env.SHEET_LISTENER_PORT || 3001;

updateClient.once('ready', () => {
    console.log('✅ Sheet Update Listener Discord bot is ready!');
    
    app.listen(PORT, () => {
        console.log(`🚀 Sheet Update Listener API running on port ${PORT}`);
        console.log(`📡 Webhook endpoint: http://localhost:${PORT}/sheet-update`);
    });
});

// ====== ERROR HANDLING ======
process.on('unhandledRejection', error => {
    console.error('❌ Unhandled promise rejection in sheet listener:', error);
});

process.on('uncaughtException', error => {
    console.error('❌ Uncaught exception in sheet listener:', error);
});

export default app;
