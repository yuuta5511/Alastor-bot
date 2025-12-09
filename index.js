import express from "express";
import { Client, GatewayIntentBits } from "discord.js";
import { google } from "googleapis";

// استيراد بوت الـ Slash Commands
import './slashCommandsBot.js';

const app = express();
app.use(express.json());

// ====== DISCORD BOT (للوظيفة الأولى فقط) ======
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
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

// ====== TRACK SENT MESSAGES ======
const sentMessages = {};

// ====== FUNCTION TO EXTRACT FIRST TWO WORDS ======
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

// ====== FUNCTION TO FIND MATCHING CHANNEL ======
function findMatchingChannel(sheetChannelName) {
    const firstTwoWords = getFirstTwoWords(sheetChannelName);
    if (!firstTwoWords) return null;
    
    // Find channel where its name starts with the first two words
    const found = client.channels.cache.find(c => {
        const channelFirstTwo = getFirstTwoWords(c.name.replace(/-/g, ' '));
        return channelFirstTwo === firstTwoWords;
    });
    
    return found;
}

// ====== FUNCTION TO CHECK NUMBERS ======
async function checkSheetAndSendMessages() {
    try {
        const res = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `${sheetName}!A:Z`
        });

        const rows = res.data.values || [];

        for (const row of rows) {
            const channelNameFromSheet = row[0]; // العمود الأول فيه اسم الروم
            const number = Number(row[5]); // العمود السادس فيه الرقم
            const status = row[7]; // العمود الثامن فيه الحالة

            // Skip if status is not "Ongoing"
            if (status !== "Ongoing") continue;

            // Find matching channel by first two words
            const channel = findMatchingChannel(channelNameFromSheet);
            if (!channel) continue;

            const channelKey = channel.name;

            // Initialize tracking for this channel if not exists
            if (!sentMessages[channelKey]) {
                sentMessages[channelKey] = { 3: false, 5: false };
            }

            // Send message for number 3 (only once)
            if (number === 3 && !sentMessages[channelKey][3]) {
                const users = [
                    "1269706276288467057",
                    "1269706276288467058",
                    "1270089817517981859"
                ];
                await channel.send(`${users.map(u => `<@&${u}>`).join(" ")} Faster or I will call my supervisor on you ￣へ￣`);
                sentMessages[channelKey][3] = true;
            }

            // Send message for number 5 (only once)
            if (number === 5 && !sentMessages[channelKey][5]) {
                const user = "1269706276309569581";
                await channel.send(`<@&${user}> Come here these guys are late`);
                sentMessages[channelKey][5] = true;
            }

            // Reset tracking if number changes (goes below 3 or above 5)
            if (number < 3) {
                sentMessages[channelKey][3] = false;
                sentMessages[channelKey][5] = false;
            } else if (number > 5) {
                sentMessages[channelKey][5] = false;
            } else if (number === 4) {
                // Between 3 and 5, keep 3 as sent but reset 5
                sentMessages[channelKey][5] = false;
            }
        }
    } catch (error) {
        console.error("❌ Error checking sheet:", error);
    }
}

// ====== WAIT FOR BOT TO BE READY ======
client.once('ready', () => {
    console.log('✅ Main Discord bot is ready!');
    checkSheetAndSendMessages();
    setInterval(checkSheetAndSendMessages, 60 * 1000);
});

// ====== API ENDPOINT (اختياري) ======
app.post("/update", async (req, res) => {
    const { channelName, number } = req.body;
    
    if (!channelName || number === undefined) {
        return res.status(400).send("Missing data");
    }

    const channel = findMatchingChannel(channelName);
    if (!channel) {
        return res.status(404).send("Channel not found");
    }

    if (number == 3) {
        await channel.send("🔔 الرقم وصل 3 — الرسالة رقم 1");
    }
    if (number == 5) {
        await channel.send("🚨 الرقم وصل 5 — الرسالة رقم 2");
    }

    res.send("OK");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API running on port ${PORT}`));

// معالجة الأخطاء
process.on('unhandledRejection', error => {
    console.error('❌ Unhandled promise rejection:', error);
});

process.on('uncaughtException', error => {
    console.error('❌ Uncaught exception:', error);
});
