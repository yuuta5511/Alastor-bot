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

// ====== FUNCTION TO EXTRACT FIRST THREE WORDS ======
function getFirstThreeWords(text) {
    if (!text) return "";
    const words = text
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .replace(/[^\x00-\x7F]/g, '')
        .split(/\s+/)
        .filter(w => w.length > 0);
    return words.slice(0, 3).join(' ');
}

// ====== FUNCTION TO FIND MATCHING CHANNEL ======
function findMatchingChannel(roleName) {
    const firstThreeWords = getFirstThreeWords(roleName);
    if (!firstThreeWords) return null;
    const found = slashBot.channels.cache.find(c => {
        const channelFirstThree = getFirstThreeWords(c.name.replace(/-/g, ' '));
        return channelFirstThree === firstThreeWords && c.isTextBased();
    });
    return found;
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
        console.log(`/request command triggered by ${interaction.user.tag}`);
        try {
            await interaction.deferReply({ ephemeral: true });

            const roleType = interaction.options.getString('role');
            const projectRole = interaction.options.getRole('for');
            const fromChapter = interaction.options.getInteger('from');
            const numberOfChapters = interaction.options.getInteger('number_of_chapters');

            if (!projectRole) {
                return interaction.editReply({ content: '❌ Selected role not found!' });
            }

            const claimWorkChannel = interaction.guild.channels.cache.find(
                ch => ch.name === '🏹〢claim・work' && ch.isTextBased()
            );

            if (!claimWorkChannel) {
                return interaction.editReply({ content: '❌ Claim・work channel not found!' });
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

            await interaction.editReply({ content: `✅ Request sent successfully to ${claimWorkChannel}!` });

        } catch (error) {
            console.error('Error in /request command:', error);
            await interaction.editReply({ content: '❌ An error occurred while executing the command!' });
        }
    }
};

slashBot.slashCommands.set(requestCommand.data.name, requestCommand);

// ====== Handle Interactions ======
slashBot.on('interactionCreate', async (interaction) => {
    if (interaction.isChatInputCommand()) {
        const command = slashBot.slashCommands.get(interaction.commandName);
        if (!command) return;

        try {
            await command.execute(interaction);
        } catch (error) {
            console.error('Command execution error:', error);
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: '❌ An error occurred while executing the command!', ephemeral: true });
            } else {
                await interaction.reply({ content: '❌ An error occurred while executing the command!', ephemeral: true });
            }
        }
    }

    if (interaction.isButton() && interaction.customId.startsWith('accept_request_')) {
        console.log(`Button clicked: ${interaction.customId} by ${interaction.user.tag}`);
        try {
            await interaction.deferReply({ ephemeral: true });

            const parts = interaction.customId.split('_');
            const requesterId = parts[2];
            const roleId = parts[3];
            const fromChapter = parts[4];
            const roleType = parts[5];

            const acceptingUser = interaction.user;
            const guild = interaction.guild;

            const role = guild.roles.cache.get(roleId);
            if (!role) {
                return interaction.editReply({ content: '❌ Role not found!' });
            }

            const member = await guild.members.fetch(acceptingUser.id);
            await member.roles.add(role);

            const emailsChannel = guild.channels.cache.find(ch => ch.name === '📝〢emails' && ch.isTextBased());
            if (!emailsChannel) {
                return interaction.editReply({ content: '❌ Emails channel not found!' });
            }

            const messages = await emailsChannel.messages.fetch({ limit: 100 });
            const userMessages = messages.filter(msg => msg.author.id === acceptingUser.id);
            if (userMessages.size === 0) {
                return interaction.editReply({ content: '❌ No previous email found in emails channel!' });
            }

            const lastUserMessage = userMessages.first();
            const userEmail = lastUserMessage.content.trim();

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
            if (!rows || rows.length === 0) return interaction.editReply({ content: '❌ Spreadsheet is empty!' });

            const header = rows[0];
            const driveColumnIndex = header.findIndex(col => col && typeof col === "string" && col.trim().toLowerCase() === "v221");
            console.log("📌 Drive Column Index:", driveColumnIndex);
            if (driveColumnIndex === -1) return interaction.editReply({ content: '❌ V221 column not found!' });

            const roleFirstThree = getFirstThreeWords(role.name);
            const projectRow = rows.find(row => row[0] && getFirstThreeWords(row[0]) === roleFirstThree);
            if (!projectRow) return interaction.editReply({ content: `❌ Project "${role.name}" not found in spreadsheet!` });

            const driveLink = projectRow[driveColumnIndex];
            console.log("🔍 DRIVE LINK EXTRACTED:", driveLink);
            if (!driveLink) return interaction.editReply({ content: `❌ Found project row but V221 is empty!` });

            const fileIdMatch = driveLink.match(/[-\w]{25,}/);
            if (!fileIdMatch) return interaction.editReply({ content: '❌ Invalid Drive link!' });
            const fileId = fileIdMatch[0];

            try {
                await drive.permissions.create({
                    fileId,
                    requestBody: { role: 'writer', type: 'user', emailAddress: userEmail },
                    sendNotificationEmail: false,
                });
            } catch (driveError) {
                console.error('Drive permission error:', driveError);
                return interaction.editReply({ content: '❌ Error giving Drive permission!' });
            }

            const targetChannel = findMatchingChannel(role.name);
            if (targetChannel) {
                await targetChannel.send(`${acceptingUser} start from ch ${fromChapter}, access granted ✅`);
            }

            const disabledButton = new ButtonBuilder()
                .setCustomId('disabled_button')
                .setLabel('Task Accepted ✅')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true);

            const newRow = new ActionRowBuilder().addComponents(disabledButton);
            const originalEmbed = interaction.message.embeds[0];
            const updatedEmbed = EmbedBuilder.from(originalEmbed)
                .setColor('#808080')
                .addFields({ name: '✅ Accepted By', value: `${acceptingUser}`, inline: true });

            await interaction.message.edit({ embeds: [updatedEmbed], components: [newRow] });

            await interaction.editReply({ content: `✅ Done! You received role ${role.name} and Drive access.` });

        } catch (error) {
            console.error('Error handling button:', error);
            await interaction.editReply({ content: '❌ Error handling the request!' });
        }
    }
});

// ====== Bot Ready ======
slashBot.once('ready', async () => {
    console.log(`✅ Slash Commands Bot is ready as ${slashBot.user.tag}`);
    await registerCommands();
});

// ====== Login ======
const token = process.env.BOT_TOKEN?.trim();
if (token) {
    slashBot.login(token)
        .then(() => console.log('✅ Slash Commands Bot logged in'))
        .catch(err => console.error('❌ Slash bot login failed:', err));
}

export default slashBot;
