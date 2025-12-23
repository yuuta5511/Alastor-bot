import { REST, Routes, SlashCommandBuilder } from 'discord.js';

const commands = [
    new SlashCommandBuilder()
        .setName('request')
        .setDescription('Request a role for a project')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator) // ⭐ ADD THIS LINE
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
            .setMinValue(1)),
    new SlashCommandBuilder()
        .setName('weeklies')
        .setDescription('Send weekly Kakao links from the PROGRESS sheet')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(option =>
            option.setName('day')
                .setDescription('Choose a specific day (optional - defaults to today)')
                .setRequired(false)
                .addChoices(
                    { name: 'Monday', value: 'monday' },
                    { name: 'Tuesday', value: 'tuesday' },
                    { name: 'Wednesday', value: 'wednesday' },
                    { name: 'Thursday', value: 'thursday' },
                    { name: 'Friday', value: 'friday' },
                    { name: 'Saturday', value: 'saturday' },
                    { name: 'Sunday', value: 'sunday' }
                )),
    new SlashCommandBuilder()
        .setName('update-members')
        .setDescription('Manually update the Members sheet with current activity')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('hiatus')
        .setDescription('Manage your hiatus status')
        .addSubcommand(subcommand =>
            subcommand
                .setName('register')
                .setDescription('Register a new hiatus period')
                .addStringOption(option =>
                    option.setName('from')
                        .setDescription('Start date (YYYY-MM-DD)')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('to')
                        .setDescription('End date (YYYY-MM-DD)')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('reason')
                        .setDescription('Reason for hiatus')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('state')
                .setDescription('Check your current hiatus status'))
].map(cmd => cmd.toJSON());

const rest = new REST().setToken(process.env.BOT_TOKEN);

export async function registerCommands() {
    try {
        console.log('🔄 Started registering slash commands...');
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands },
        );
        console.log('✅ Successfully registered slash commands!');
    } catch (error) {
        console.error('❌ Error registering commands:', error);
    }
}

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
