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

const creds = JSON.parse(
  Buffer.from(process.env.GOOGLE_CREDS_BASE64, "base64").toString("utf8")
);

await doc.useServiceAccountAuth({
  client_email: creds.client_email,
  private_key: creds.private_key.replace(/\\n/g, "\n"),
});

await doc.loadInfo();
const sheet = doc.sheetsByIndex[1];


// ====== FUNCTION TO CHECK NUMBERS ======
async function checkSheetAndSendMessages() {
    const rows = await sheet.getRows({ offset: 0 }); // يقرأ كل الصفوف
for (const row of rows) {
    // row._rawData هو array لكل خلايا الصف
    const channelName = row._rawData[0];
    const number = Number(row._rawData[5]);
    
        const channel = client.channels.cache.find(c => c.name === channelName);
        if (!channel) continue;

        if (number === 5) {
            const user1 = "1269706276288467057";
            const user2 = "1269706276288467058";
            const user3 = "1270089817517981859";
            await channel.send(`<@${user1}> <@${user2}> <@${user3}> Faster or i will call my suber visor on u ￣へ￣ `);
        }

        if (number === 7) {
            const user1 = "895989670142435348";
            await channel.send(`<@${user1}> Come here `);
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
