import express from "express";
import { Client, GatewayIntentBits } from "discord.js";

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

// ====== ROLE MENTIONS (same as index.js) ======
const roleMentions = {
    'ED': '<@&1269706276288467057>',
    'PR': '<@&1269706276288467058>',
    'KTL': '<@&1270089817517981859>',
    'CTL': '<@&1269706276288467059>',
    'JTL': '<@&1288004879020724276>',
};

// ====== FUNCTION TO EXTRACT FIRST TWO WORDS (same as index.js) ======
function getFirstTwoWords(text) {
    if (!text) return "";
    
    // Remove ALL punctuation (including apostrophes) and emojis, keep only letters/numbers
    const words = text
        .toLowerCase()
        .replace(/[^\w\s]/g, '') // Remove all punctuation
        .replace(/[^\x00-\x7F]/g, '') // Remove non-ASCII (emojis, arabic letters, etc)
        .split(/\s+/)
        .filter(w => w.length > 0);
    
    return words.slice(0, 2).join(' ');
}

// ====== FUNCTION TO FIND MATCHING CHANNEL (same as index.js) ======
function findMatchingChannel(sheetChannelName) {
    const firstTwoWords = getFirstTwoWords(sheetChannelName);
    if (!firstTwoWords) return null;
    
    // Find channel where its name starts with the first two words
    const found = updateClient.channels.cache.find(c => {
        const channelFirstTwo = getFirstTwoWords(c.name.replace(/-/g, ' '));
        return channelFirstTwo === firstTwoWords;
    });
    
    return found;
}

// ====== CREATE EXPRESS APP FOR WEBHOOK ======
const app = express();
app.use(express.json());

// ====== WEBHOOK ENDPOINT ======
app.post("/sheet-update", async (req, res) => {
    try {
        const { channelName, oldValue, newValue } = req.body;

        // Validate input
        if (!channelName || oldValue === undefined || newValue === undefined) {
            return res.status(400).json({ 
                error: "Missing required fields: channelName, oldValue, newValue" 
            });
        }

        console.log(`📩 Received sheet update:`, { channelName, oldValue, newValue });

        // Find matching Discord channel
        const channel = findMatchingChannel(channelName);
        if (!channel) {
            console.log(`⚠️ Channel not found for: ${channelName}`);
            return res.status(404).json({ 
                error: `Channel not found for: ${channelName}` 
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
