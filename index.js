import express from "express";
import { Client, GatewayIntentBits } from "discord.js";
import { GoogleSpreadsheet } from "google-spreadsheet";
import fs from "fs";

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
const doc = new GoogleSpreadsheet(process.env.SHEET_ID);
const creds = JSON.parse(fs.readFileSync("./service-account.json")); // أو ممكن تحطه في متغير بيئي
await doc.useServiceAccountAuth(creds);
await doc.loadInfo();
const sheet = doc.sheetsByIndex[0]; // أول شيت

// ====== FUNCTION TO CHECK NUMBERS ======
async function checkSheetAndSendMessages() {
    const rows = await sheet.getRows();
    for (const row of rows) {
        const channelName = row.RoomName;
        const number = Number(row.Number);

        const channel = client.channels.cache.find(c => c.name === channelName);
        if (!channel) continue;

        if (number === 5) {
            await channel.send("🔔 الرقم وصل 5 — الرسالة رقم 1");
        }

        if (number === 7) {
            await channel.send("🚨 الرقم وصل 7 — الرسالة رقم 2");
        }
    }
}

// ====== RUN CHECK EVERY MINUTE ======
setInterval(checkSheetAndSendMessages, 60 * 1000);

// ====== API ENDPOINT (اختياري) ======
app.post("/update", async (req, res) => {
    const { channelName, number } = req.body;
    if (!channelName || number === undefined) return res.status(400).send("Missing data");

    const channel = client.channels.cache.find(c => c.name === channelName);
    if (!channel) return res.status(404).send("Channel not found");

    if (number == 5) await channel.send("🔔 الرقم وصل 5 — الرسالة رقم 1");
    if (number == 7) await channel.send("🚨 الرقم وصل 7 — الرسالة رقم 2");

    res.send("OK");
});

app.listen(3000, () => console.log("API running"));
