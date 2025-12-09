import express from "express";
import { Client, GatewayIntentBits } from "discord.js";
import { google } from "googleapis";

const app = express();
app.use(express.json());

// ====== DISCORD BOT ======
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

const token = process.env.BOT_TOKEN?.trim();
if (!token) {
    console.error("❌ BOT_TOKEN مش موجود!");
    process.exit(1);
}

client.login(token)
    .then(() => console.log(`✅ Bot logged in as ${client.user.tag}`))
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
const sheetName = "Sheet6"; // اسم الصفحة الثانية

// ====== FUNCTION TO CHECK NUMBERS ======
async function checkSheetAndSendMessages() {
    try {
        const res = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `${sheetName}!A:Z` // كل الأعمدة حتى Z
        });

        const rows = res.data.values || [];

        for (const row of rows) {
            const channelName = row[0]; // العمود الأول فيه اسم الروم
            const number = Number(row[5]); // العمود السادس فيه الرقم

            const channel = client.channels.cache.find(c => c.name === channelName);
            if (!channel) continue;

            if (number === 5) {
                const users = [
                    "1269706276288467057",
                    "1269706276288467058",
                    "1270089817517981859"
                ];
                await channel.send(`${users.map(u => `<@${u}>`).join(" ")} Faster or I will call my supervisors on you ￣へ￣`);
            }

            if (number === 7) {
                const user = "895989670142435348";
                await channel.send(`<@${user}> Come here`);
            }
        }
    } catch (error) {
        console.error("❌ Error checking sheet:", error);
    }
}

// ====== WAIT FOR BOT TO BE READY ======
client.once('ready', () => {
    console.log('✅ Discord bot is ready!');
    // Start checking after bot is ready
    checkSheetAndSendMessages();
    setInterval(checkSheetAndSendMessages, 60 * 1000);
});

// ====== API ENDPOINT (اختياري) ======
app.post("/update", async (req, res) => {
    const { channelName, number } = req.body;
    
    if (!channelName || number === undefined) {
        return res.status(400).send("Missing data");
    }

    const channel = client.channels.cache.find(c => c.name === channelName);
    if (!channel) {
        return res.status(404).send("Channel not found");
    }

    if (number == 5) {
        await channel.send(" الرقم وصل 5 — الرسالة رقم 1");
    }
    if (number == 7) {
        await channel.send(" الرقم وصل 7 — الرسالة رقم 2");
    }

    res.send("OK");
});

app.listen(3000, () => console.log("API running on port 3000"));
