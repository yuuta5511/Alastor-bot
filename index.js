// index.js
import express from "express";
import { Client, GatewayIntentBits } from "discord.js";
import { GoogleSpreadsheet } from "google-spreadsheet";

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

// مفكوك من Base64 في Environment Variable
const creds = JSON.parse(
  Buffer.from(process.env.GOOGLE_CREDS_BASE64, "base64").toString("utf8")
);

// الطريقة الحديثة للمصادقة
await doc.useServiceAccountAuth({
  client_email: creds.client_email,
  private_key: creds.private_key.replace(/\\n/g, "\n"),
});

await doc.loadInfo();

// قراءة الصفحة الثانية (index = 1)
const sheet = doc.sheetsByIndex[1];

// ====== FUNCTION TO CHECK NUMBERS ======
async function checkSheetAndSendMessages() {
  const rows = await sheet.getRows({ offset: 0 });
  
  for (const row of rows) {
    // row._rawData يحتوي على كل خلايا الصف كـ array
    const channelName = row._rawData[0]; // العمود 1 = اسم الروم
    const number = Number(row._rawData[1]); // العمود 2 = الرقم (غير ثابت حسب شيتك)

    const channel = client.channels.cache.find(c => c.name === channelName);
    if (!channel) continue;

    // مثال لمنشنات متعددة عند الرقم 5
    if (number === 5) {
      const mentions = ["1269706276288467057", "1269706276288467058", "1270089817517981859"];
      await channel.send(`${mentions.map(id => `<@${id}>`).join(" ")} Faster or i will call my subervisors on u`);
    }

    // مثال لمنشن واحد عند الرقم 7
    if (number === 7) {
      const mentions = ["895989670142435348"];
      await channel.send(`${mentions.map(id => `<@${id}>`).join(" ")} come here`);
    }
  }
}

// ====== RUN CHECK EVERY MINUTE ======
setInterval(checkSheetAndSendMessages, 60 * 1000);

// ====== OPTIONAL API ENDPOINT ======
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
