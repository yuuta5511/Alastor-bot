import { Client, GatewayIntentBits, Collection, SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from "discord.js";
import { google } from "googleapis";

// ====== DISCORD BOT for Slash Commands ======
const slashBot = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
    ],
});

slashBot.slashCommands = new Collection();

// ====== Role Mentions Mapping ======
const roleMentions = {
    'ED': '<@&1269706276288467057>',
    'PR': '<@&1269706276288467058>',
    'KTL': '<@&1270089817517981859>',
    'CTL': '<@&1269706276288467059>',
    'JTL': '<@&1288004879020724276>',
};

// ====== FUNCTION TO EXTRACT FIRST TWO WORDS ======
function getFirstTwoWords(text) {
    if (!text) return "";
    const words = text.toLowerCase().replace(/[^\w\s]/g, '').replace(/[^\x00-\x7F]/g, '').split(/\s+/).filter(w => w.length > 0);
    return words.slice(0, 2).join(' ');
}

// ====== FUNCTION TO FIND MATCHING CHANNEL ======
function findMatchingChannel(roleName) {
    const firstTwoWords = getFirstTwoWords(roleName);
    if (!firstTwoWords) return null;
    return slashBot.channels.cache.find(c => getFirstTwoWords(c.name.replace(/-/g, ' ')) === firstTwoWords && c.isTextBased());
}

// ====== /assign Command ======
const assignCommand = {
    data: new SlashCommandBuilder()
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

    async execute(interaction) {
        console.log(`[Assign] Command triggered by ${interaction.user.tag}`);
        try {
            if (!interaction.member.permissions.has('Administrator')) {
                console.log(`[Assign] User ${interaction.user.tag} is not admin`);
                return interaction.reply({ content: '❌ You do not have permission to use this command!', ephemeral: true });
            }

            await interaction.deferReply({ ephemeral: true });
            console.log('[Assign] Defer reply done');

            const targetUser = interaction.options.getUser('user');
            const role = interaction.options.getRole('to');
            const fromChapter = interaction.options.getInteger('from');

            console.log(`[Assign] Assigning role ${role.name} to ${targetUser.tag} starting from chapter ${fromChapter}`);

            // ====== Fetch the guild member ======
            const member = await interaction.guild.members.fetch(targetUser.id);
            await member.roles.add(role);
            console.log('[Assign] Role added to user');

            // ====== Google API Setup ======
            const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
            const auth = new google.auth.GoogleAuth({
                credentials: creds,
                scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive']
            });
            const authClient = await auth.getClient();
            const sheets = google.sheets({ version: 'v4', auth: authClient });
            const drive = google.drive({ version: 'v3', auth: authClient });

            const spreadsheetId = process.env.SHEET_ID;
            const sheetName = process.env.SHEET_NAME || 'PROGRESS';

            const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${sheetName}!A:ZZ` });
            const rows = response.data.values;
            if (!rows || rows.length === 0) {
                console.log('[Assign] Spreadsheet empty');
                return interaction.editReply({ content: '❌ Spreadsheet is empty!' });
            }

            const header = rows[0];
            const driveColumnIndex = header.findIndex(col => col && typeof col === "string" && col.trim().toLowerCase() === "v221");
            if (driveColumnIndex === -1) {
                console.log('[Assign] V221 column not found');
                return interaction.editReply({ content: '❌ V221 column not found!' });
            }

            const roleFirstTwo = getFirstTwoWords(role.name);
            const projectRow = rows.find(row => row[0] && getFirstTwoWords(row[0]) === roleFirstTwo);
            if (!projectRow) {
                console.log(`[Assign] Project ${role.name} not found in sheet`);
                return interaction.editReply({ content: `❌ Project "${role.name}" not found in spreadsheet!` });
            }

            const driveLink = projectRow[driveColumnIndex];
            if (!driveLink) {
                console.log('[Assign] Drive link empty');
                return interaction.editReply({ content: `❌ Found project row but V221 is empty!` });
            }

            const fileIdMatch = driveLink.match(/[-\w]{25,}/);
            if (!fileIdMatch) return interaction.editReply({ content: '❌ Invalid Drive link!' });

            const fileId = fileIdMatch[0];

            // ====== Give Drive Permission ======
            const emailsChannel = interaction.guild.channels.cache.find(ch => ch.name === '📝〢emails' && ch.isTextBased());
            if (!emailsChannel) {
                console.log('[Assign] Emails channel not found');
                return interaction.editReply({ content: '❌ Emails channel not found!' });
            }

            const messages = await emailsChannel.messages.fetch({ limit: 100 });
            const userMessages = messages.filter(msg => msg.author.id === targetUser.id);
            if (userMessages.size === 0) {
                console.log('[Assign] No previous email found for user');
                return interaction.editReply({ content: '❌ No email found in emails channel for the user!' });
            }

            const userEmail = userMessages.first().content.trim();
            await drive.permissions.create({
                fileId,
                requestBody: { role: 'writer', type: 'user', emailAddress: userEmail },
                sendNotificationEmail: false,
            });
            console.log('[Assign] Drive permission granted');

            // ====== Send message to project channel ======
            const targetChannel = findMatchingChannel(role.name);
            if (targetChannel) {
                await targetChannel.send(`${targetUser} start from ch ${fromChapter}, access granted ✅`);
            }

            console.log('[Assign] Message sent to project channel');
            await interaction.editReply(`✅ Assigned ${role.name} to ${targetUser.tag} starting from chapter ${fromChapter} and granted Drive access`);

        } catch (error) {
            console.error('[Assign] Error:', error);
            if (interaction.deferred) {
                await interaction.editReply('❌ Error while executing /assign command!');
            } else {
                await interaction.reply({ content: '❌ Error while executing /assign command!', ephemeral: true });
            }
        }
    }
};

// ====== Register assign command ======
slashBot.slashCommands.set(assignCommand.data.name, assignCommand);

// ====== Handle interactions (buttons remain unchanged) ======
slashBot.on('interactionCreate', async (interaction) => {
    if (interaction.isChatInputCommand()) {
        const command = slashBot.slashCommands.get(interaction.commandName);
        if (!command) return;
        try { await command.execute(interaction); } 
        catch (error) { console.error('Command execution error:', error); }
    }
});

// ====== Bot Ready ======
slashBot.once('ready', async () => {
    console.log(`✅ Slash Commands Bot is ready as ${slashBot.user.tag}`);
});

// ====== Login ======
const token = process.env.BOT_TOKEN?.trim();
if (token) {
    slashBot.login(token)
        .then(() => console.log('✅ Slash Commands Bot logged in'))
        .catch(err => console.error('❌ Slash bot login failed:', err));
}

export default slashBot;
