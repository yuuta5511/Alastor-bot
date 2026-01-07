import { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

const commands = [
    new SlashCommandBuilder()
        .setName('request')
        .setDescription('Request a role for a project')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
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
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
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
                .setDescription('Check your current hiatus status')),
    // NEW PAYMENT TRACKING COMMANDS
    new SlashCommandBuilder()
        .setName('register')
        .setDescription('Register your payment information')
        .addStringOption(option =>
            option.setName('email')
                .setDescription('Your email address')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('payment_method')
                .setDescription('Choose your payment method')
                .setRequired(true)
                .addChoices(
                    { name: 'Binance', value: 'binance' },
                    { name: 'PayPal', value: 'paypal' }
                ))
        .addStringOption(option =>
            option.setName('payment_id')
                .setDescription('Your Binance ID or PayPal email/link')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('account_name')
                .setDescription('Your account name')
                .setRequired(true)),
    new SlashCommandBuilder()
        .setName('mypoints')
        .setDescription('Check your current points balance'),
    new SlashCommandBuilder()
        .setName('deduct')
        .setDescription('Deduct points from a user (Admin only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addUserOption(option =>
            option.setName('from')
                .setDescription('Select the user to deduct points from')
                .setRequired(true))
        .addNumberOption(option =>
            option.setName('amount')
                .setDescription('Amount of points to deduct')
                .setRequired(true)
                .setMinValue(0))
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for deduction (optional)')
                .setRequired(false)),
    new SlashCommandBuilder()
        .setName('lazy')
        .setDescription('List inactive members by role (Admin only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(option =>
            option.setName('role')
                .setDescription('Select role to check')
                .setRequired(true)
                .addChoices(
                    { name: 'Editor (ED)', value: 'ED' },
                    { name: 'Proofreader (PR)', value: 'PR' },
                    { name: 'Translator KTL', value: 'KTL' },
                    { name: 'Translator JTL', value: 'JTL' },
                    { name: 'Translator CTL', value: 'CTL' },
                    { name: 'ALL ROLES', value: 'ALL' }
                )),
    new SlashCommandBuilder()
        .setName('series')
        .setDescription('Check series progress')
        .addSubcommand(subcommand =>
            subcommand
                .setName('state')
                .setDescription('View progress of all ongoing chapters in this series')),
    new SlashCommandBuilder()
        .setName('submit')
        .setDescription('Submit completed work')
        .addStringOption(option =>
            option.setName('series')
                .setDescription('Select the series')
                .setRequired(true)
                .setAutocomplete(true))
        .addIntegerOption(option =>
            option.setName('chapter')
                .setDescription('Chapter number')
                .setRequired(true)
                .setMinValue(1))
        .addStringOption(option =>
            option.setName('role')
                .setDescription('Your role for this work')
                .setRequired(true)
                .addChoices(
                    { name: 'Editor (ED)', value: 'ED' },
                    { name: 'Translator (TL)', value: 'TL' },
                    { name: 'Proofreader (PR)', value: 'PR' }
                ))
].map(cmd => cmd.toJSON());

const rest = new REST().setToken(process.env.BOT_TOKEN);

export async function registerCommands() {
    try {
        console.log('📄 Started registering slash commands...');
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
        console.log('📄 Started registering guild slash commands...');
        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, guildId),
            { body: commands },
        );
        console.log('✅ Successfully registered guild slash commands!');
    } catch (error) {
        console.error('❌ Error registering guild commands:', error);
    }
}
