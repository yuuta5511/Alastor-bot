import { REST, Routes, SlashCommandBuilder } from 'discord.js';

const commands = [
    new SlashCommandBuilder()
        .setName('request')
        .setDescription('Request a role for a project')
        .addStringOption(option =>
            option.setName('role')
            .setDescription('The role type you need')
            .setRequired(true)
            .addChoices(
                { name: 'Editor (ED)', value: 'ED' },
                { name: 'Proofreader (PR)', value: 'PR' },
                { name: 'Translator KTL', value: 'KTL' },
                { name: 'Translator JTL', value: 'JTL' },
                { name: 'Translator CTL', value: 'CTL' },
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
            .setMinValue(1)),

    new SlashCommandBuilder()
        .setName('assign')
        .setDescription('Assign a role and Drive access to a user')
        .addUserOption(option =>
            option.setName('user')
            .setDescription('Select a user to assign')
            .setRequired(true))
        .addRoleOption(option =>
            option.setName('to')
            .setDescription('Select a role to assign (matching room name)')
            .setRequired(true))
        .addIntegerOption(option =>
            option.setName('from')
            .setDescription('Starting chapter number')
            .setRequired(true)
            .setMinValue(1))
].map(cmd => cmd.toJSON());


const rest = new REST().setToken(process.env.BOT_TOKEN);

export async function registerCommands() {
    try {
        console.log('🔄 Started registering slash commands...');

        // Register commands globally (يظهر في كل السيرفرات)
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands },
        );

        console.log('✅ Successfully registered slash commands!');
    } catch (error) {
        console.error('❌ Error registering commands:', error);
    }
}

// لو عايز تسجل في سيرفر واحد بس (أسرع للتجربة):
export async function registerCommandsGuild(guildId) {
    try {
        console.log('🔄 Started registering guild slash commands...');

        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, guildId),
            { body: commands },
        );

        console.log('✅ Successfully registered guild slash commands!');
    } catch (error) {
        console.error('❌ Error registering guild commands:', error);
    }
}
