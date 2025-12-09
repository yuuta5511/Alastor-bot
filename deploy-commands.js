import { REST, Routes, SlashCommandBuilder } from 'discord.js';

// ====== Configuration ======
const CLIENT_ID = process.env.CLIENT_ID || 'YOUR_CLIENT_ID'; // Bot Client ID
const GUILD_ID = process.env.GUILD_ID || 'YOUR_GUILD_ID';   // Server ID
const TOKEN = process.env.BOT_TOKEN?.trim();

if (!TOKEN) {
    console.error('❌ BOT_TOKEN مش موجود!');
    process.exit(1);
}

// ====== تعريف الأوامر ======
const commands = [
    new SlashCommandBuilder()
        .setName('request')
        .setDescription('Request a role for a project')
        .addStringOption(option =>
            option.setName('role')
                .setDescription('The role type you need')
                .setRequired(true)
                .addChoices(
                    { name: 'Translator (TL)', value: 'TL' },
                    { name: 'Editor (ED)', value: 'ED' },
                    { name: 'Proofreader (PR)', value: 'PR' }
                ))
        .addRoleOption(option =>
            option.setName('for')
                .setDescription('Select the project role')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('from')
                .setDescription('Starting chapter number')
                .setRequired(true)
                .setMinValue(1))
        .addIntegerOption(option =>
            option.setName('number_of_chapters')
                .setDescription('Number of chapters needed (optional)')
                .setRequired(false)
                .setMinValue(1))
].map(command => command.toJSON());

// ====== تسجيل الأوامر ======
const rest = new REST().setToken(TOKEN);

(async () => {
    try {
        console.log(`🔄 Started refreshing ${commands.length} application (/) commands.`);

        if (GUILD_ID && GUILD_ID !== 'YOUR_GUILD_ID') {
            // تسجيل في سيرفر محدد (أسرع - للتطوير)
            const data = await rest.put(
                Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
                { body: commands },
            );
            console.log(`✅ Successfully registered ${data.length} guild commands in server ${GUILD_ID}`);
        } else {
            // تسجيل عالمي (يأخذ وقت - للإنتاج)
            const data = await rest.put(
                Routes.applicationCommands(CLIENT_ID),
                { body: commands },
            );
            console.log(`✅ Successfully registered ${data.length} global commands`);
            console.log('⏰ Note: Global commands may take up to 1 hour to appear');
        }

    } catch (error) {
        console.error('❌ Error deploying commands:', error);
        if (error.code === 50001) {
            console.error('⚠️  Missing Access - Make sure the bot has applications.commands scope');
        }
    }
})();
