import { Client, GatewayIntentBits, Collection, SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from "discord.js";
import { google } from "googleapis";
import { registerCommands } from './registerCommands.js';

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

// ====== Utility Functions ======
function getFirstTwoWords(text) {
    if (!text) return "";
    const words = text
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .replace(/[^\x00-\x7F]/g, '')
        .split(/\s+/)
        .filter(w => w.length > 0);
    return words.slice(0, 2).join(' ');
}

function findMatchingChannel(roleName) {
    const firstTwoWords = getFirstTwoWords(roleName);
    if (!firstTwoWords) return null;
    return slashBot.channels.cache.find(c => {
        const channelFirstTwo = getFirstTwoWords(c.name.replace(/-/g, ' '));
        return channelFirstTwo === firstTwoWords && c.isTextBased();
    });
}

// ====== /request Command ======
const requestCommand = {
    data: new SlashCommandBuilder()
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
    async execute(interaction) {
        if (!interaction.member.permissions.has('Administrator')) {
            return interaction.reply({
                content: '❌ You do not have permission to use this command!',
                ephemeral: true
            });
        }

        try {
            const roleType = interaction.options.getString('role');
            const projectRole = interaction.options.getRole('for');
            const fromChapter = interaction.options.getInteger('from');
            const numberOfChapters = interaction.options.getInteger('number_of_chapters');

            if (!projectRole) {
                return interaction.reply({ content: '❌ Selected role not found!', ephemeral: true });
            }

            const claimWorkChannel = interaction.guild.channels.cache.find(
                ch => ch.name === '🏹〢claim・work' && ch.isTextBased()
            );

            if (!claimWorkChannel) {
                return interaction.reply({ content: '❌ Claim・work channel not found!', ephemeral: true });
            }

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle(`📢 ${roleType} Needed!`)
                .setDescription(`**Project:** ${projectRole.name}\n**Role Needed:** ${roleMentions[roleType] || roleType}`)
                .addFields({ name: '👤 Requested By', value: `${interaction.user}`, inline: true })
                .setTimestamp();

            if (numberOfChapters) {
                embed.addFields({ name: '📚 Number of Chapters', value: `${numberOfChapters}`, inline: true });
            }

            const button = new ButtonBuilder()
                .setCustomId(`accept_request_${interaction.user.id}_${projectRole.id}_${fromChapter}_${roleType}`)
                .setLabel('Accept Task ✅')
                .setStyle(ButtonStyle.Success);

            const row = new ActionRowBuilder().addComponents(button);

            await claimWorkChannel.send({ embeds: [embed], components: [row] });

            await interaction.reply({
                content: `✅ Request sent successfully to ${claimWorkChannel}!`,
                ephemeral: true
            });
        } catch (error) {
            console.error('Error in /request command:', error);
            await interaction.reply({ content: '❌ An error occurred while executing the command!', ephemeral: true });
        }
    }
};

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
        if (!interaction.member.permissions.has('Administrator')) {
            return interaction.reply({ content: '❌ You do not have permission to use this command!', ephemeral: true });
        }

        try {
            const targetUser = interaction.options.getUser('user');
            const role = interaction.options.getRole('to');
            const fromChapter = interaction.options.getInteger('from');
            const guild = interaction.guild;

            // Give role
            const member = await guild.members.fetch(targetUser.id);
            await member.roles.add(role);

            // Fetch user email from emails channel
            const emailsChannel = guild.channels.cache.find(ch => ch.name === '📝〢emails' && ch.isTextBased());
            const messages = await emailsChannel.messages.fetch({ limit: 100 });
            const userMessages = messages.filter(msg => msg.author.id === targetUser.id);
            if (!userMessages.size) return interaction.reply({ content: '❌ No email found for user!', ephemeral: true });
            const lastUserMessage = userMessages.first();
            const userEmail = lastUserMessage.content.trim();

            // ====== Google API Setup ======
            const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
            const auth = new google.auth.GoogleAuth({
                credentials: creds,
                scopes: [
                    'https://www.googleapis.com/auth/spreadsheets',
                    'https://www.googleapis.com/auth/drive'
                ]
            });
            const authClient = await auth.getClient();
            const sheets = google.sheets({ version: 'v4', auth: authClient });
            const drive = google.drive({ version: 'v3', auth: authClient });

            const spreadsheetId = process.env.SHEET_ID;
            const sheetName = process.env.SHEET_NAME || 'PROGRESS';

            const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${sheetName}!A:ZZ` });
            const rows = response.data.values;
            if (!rows || !rows.length) return interaction.reply({ content: '❌ Spreadsheet is empty!', ephemeral: true });

            const header = rows[0];
            const driveColumnIndex = header.findIndex(col => col && col.toString().trim().toLowerCase() === 'v221');
            if (driveColumnIndex === -1) return interaction.reply({ content: '❌ V221 column not found!', ephemeral: true });

            const roleFirstTwo = getFirstTwoWords(role.name);
            const projectRow = rows.find(row => row[0] && getFirstTwoWords(row[0]) === roleFirstTwo);
            if (!projectRow) return interaction.reply({ content: `❌ Project "${role.name}" not found in spreadsheet!`, ephemeral: true });

            const driveLink = projectRow[driveColumnIndex];
            if (!driveLink) return interaction.reply({ content: '❌ Drive link empty!', ephemeral: true });

            const fileIdMatch = driveLink.match(/[-\w]{25,}/);
            if (!fileIdMatch) return interaction.reply({ content: '❌ Invalid Drive link!', ephemeral: true });
            const fileId = fileIdMatch[0];

            await drive.permissions.create({
                fileId,
                requestBody: { role: 'writer', type: 'user', emailAddress: userEmail },
                sendNotificationEmail: false,
            });

            // Notify target channel
            const targetChannel = findMatchingChannel(role.name);
            if (targetChannel) await targetChannel.send(`${targetUser} start from ch ${fromChapter}, access granted ✅`);

            await interaction.reply({ content: `✅ ${targetUser} received role ${role.name} and Drive access!`, ephemeral: true });

        } catch (error) {
            console.error('Error in /assign command:', error);
            await interaction.reply({ content: '❌ Error assigning role!', ephemeral: true });
        }
    }
};

// ====== Register Commands in Collection ======
slashBot.slashCommands.set(requestCommand.data.name, requestCommand);
slashBot.slashCommands.set(assignCommand.data.name, assignCommand);

// ====== Handle Interactions ======
slashBot.on('interactionCreate', async (interaction) => {
    if (interaction.isChatInputCommand()) {
        const command = slashBot.slashCommands.get(interaction.commandName);
        if (!command) return;
        try { await command.execute(interaction); }
        catch (error) { console.error('Command execution error:', error); interaction.reply({ content: '❌ An error occurred!', ephemeral: true }); }
    }

    // Keep your existing button logic for /request here...
});

// ====== Bot Ready ======
slashBot.once('ready', async () => {
    console.log(`✅ Slash Commands Bot ready as ${slashBot.user.tag}`);
    await registerCommands();
});

// ====== Login ======
slashBot.login(process.env.BOT_TOKEN?.trim())
    .then(() => console.log('✅ Bot logged in'))
    .catch(err => console.error('❌ Bot login failed:', err));

export default slashBot;
