const { REST, Routes } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');

// معلومات البوت
const clientId = 'YOUR_CLIENT_ID'; // ضع Client ID هنا
const guildId = 'YOUR_GUILD_ID'; // ضع Server ID هنا
const token = 'YOUR_BOT_TOKEN'; // ضع التوكن هنا

const commands = [];

// قراءة ملفات الأوامر
const commandsPath = path.join(__dirname, 'commands', 'slash');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
        commands.push(command.data.toJSON());
        console.log(`✅ Loaded command: ${command.data.name}`);
    } else {
        console.log(`⚠️  Warning: ${file} is missing required "data" or "execute" property.`);
    }
}

// تسجيل الأوامر
const rest = new REST().setToken(token);

(async () => {
    try {
        console.log(`🔄 Started refreshing ${commands.length} application (/) commands.`);

        // لتسجيل الأوامر في سيرفر محدد (أسرع للتطوير)
        const data = await rest.put(
            Routes.applicationGuildCommands(clientId, guildId),
            { body: commands },
        );

        // لتسجيل الأوامر عالمياً (يأخذ وقت حتى ساعة)
        // const data = await rest.put(
        //     Routes.applicationCommands(clientId),
        //     { body: commands },
        // );

        console.log(`✅ Successfully reloaded ${data.length} application (/) commands.`);
    } catch (error) {
        console.error('❌ Error deploying commands:', error);
    }
})();
