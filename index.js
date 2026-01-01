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
    console.error("❌ BOT_TOKEN مش موجود!");
    process.exit(1);
}

client.login(token)
    .then(() => console.log(`✅ Main Bot logged in as ${client.user.tag}`))
    .catch(err => {
        console.error("❌ فشل تسجيل الدخول:", err);
        process.exit(1);
    });

// ====== GOOGLE SHEET SETUP (for other files to import) ======
const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);

const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
});

const sheetsClient = await auth.getClient();
export const sheets = google.sheets({ version: "v4", auth: sheetsClient });
export const spreadsheetId = process.env.SHEET_ID;
export const sheetName = process.env.SHEET_NAME || "PROGRESS";

// ====== BOT READY ======
client.once('ready', async () => {
    console.log('✅ Main Discord bot is ready!');
    
    startWeekliesScheduler(client);
    
    console.log('⏰ Starting hiatus checker...');
    startHiatusChecker(client);
    
    console.log('⏳ Waiting for initial hiatus check...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    console.log('📊 Starting member activity tracking...');
    startMemberTracking(client);
    
    console.log('📊 Running initial members update...');
    const { manualUpdateMembers } = await import('./memberActivityTracker.js');
    await manualUpdateMembers(client);
    console.log('✅ Initial members update complete!');
    
    startChannelTracker(client);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API running on port ${PORT}`));

// Error handling
process.on('unhandledRejection', error => {
    console.error('❌ Unhandled promise rejection:', error);
});

process.on('uncaughtException', error => {
    console.error('❌ Uncaught exception:', error);
});
