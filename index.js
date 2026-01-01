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
    console.error("❌ BOT_TOKEN not found!");
    process.exit(1);
}

client.login(token)
    .then(() => console.log(`✅ Main Bot logged in as ${client.user.tag}`))
    .catch(err => {
        console.error("❌ Login failed:", err);
        process.exit(1);
    });

// ====== WAIT FOR BOT TO BE READY ======
client.once('ready', async () => {
    console.log('✅ Main Discord bot is ready!');
    
    // Start the weeklies scheduler
    startWeekliesScheduler(client);
    
    // Start hiatus checker first
    console.log('⏰ Starting hiatus checker...');
    startHiatusChecker(client);
    
    // Wait for initial hiatus check to complete
    console.log('⏳ Waiting for initial hiatus check...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Start member activity tracking
    console.log('📊 Starting member activity tracking...');
    startMemberTracking(client);
    
    // Run initial member update
    console.log('📊 Running initial members update...');
    const { manualUpdateMembers } = await import('./memberActivityTracker.js');
    await manualUpdateMembers(client);
    console.log('✅ Initial members update complete!');
    
    // Start channel tracker
    startChannelTracker(client);
});

// ====== API ENDPOINT ======
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API running on port ${PORT}`));

// Error handling
process.on('unhandledRejection', error => {
    console.error('❌ Unhandled promise rejection:', error);
});

process.on('uncaughtException', error => {
    console.error('❌ Uncaught exception:', error);
});
