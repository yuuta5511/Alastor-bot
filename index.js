import express from "express";
import { Client, GatewayIntentBits } from "discord.js";
import { google } from "googleapis";
import './slashCommandsBot.js';
import './sheetUpdateListener.js';
import { startWeekliesScheduler } from './autoWeeklies.js';
import { startMemberTracking } from './memberActivityTracker.js';
import { startHiatusChecker } from './hiatusChecker.js';
import { startChannelTracker } from './channelTracker.js';

const app = express();
app.use(express.json());

// ====== DISCORD BOT ======
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ],
});

const token = process.env.BOT_TOKEN?.trim();
if (!token) {
    console.error("❌ BOT_TOKEN is missing!");
    process.exit(1);
}

client.login(token)
    .then(() => console.log(`✅ Main Bot logged in as ${client.user.tag}`))
    .catch(err => {
        console.error("❌ Login failed:", err);
        process.exit(1);
    });

// ====== GOOGLE SHEET SETUP ======
const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);

const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
});

const sheetsClient = await auth.getClient();
const sheets = google.sheets({ version: "v4", auth: sheetsClient });

const spreadsheetId = process.env.SHEET_ID;
const sheetName = process.env.SHEET_NAME || "PROGRESS";

// ====== BOT READY ======
client.once('ready', async () => {
    console.log('✅ Main Discord bot is ready!');
    
    // ⭐ START THE WEEKLIES SCHEDULER
    startWeekliesScheduler(client);
    
    // ⭐ START HIATUS CHECKER FIRST (before member tracking)
    console.log('⏰ Starting hiatus checker...');
    startHiatusChecker(client);
    
    // ⭐ Wait for initial hiatus check to complete
    console.log('⏳ Waiting for initial hiatus check...');
    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
    
    // ⭐ NOW START MEMBER ACTIVITY TRACKING
    console.log('📊 Starting member activity tracking...');
    startMemberTracking(client);
    
    // ⭐ RUN INITIAL MEMBER UPDATE
    console.log('📊 Running initial members update...');
    const { manualUpdateMembers } = await import('./memberActivityTracker.js');
    await manualUpdateMembers(client);
    console.log('✅ Initial members update complete!');
    
    // ⭐ START CHANNEL TRACKER
    startChannelTracker(client);
});

// ====== SERVER ======
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ API running on port ${PORT}`));

// ====== ERROR HANDLING ======
process.on('unhandledRejection', error => {
    console.error('❌ Unhandled promise rejection:', error);
});

process.on('uncaughtException', error => {
    console.error('❌ Uncaught exception:', error);
});
