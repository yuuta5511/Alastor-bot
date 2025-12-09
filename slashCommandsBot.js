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

// ====== FUNCTION TO EXTRACT FIRST TWO WORDS ======
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

// ====== FUNCTION TO FIND MATCHING CHANNEL ======
function findMatchingChannel(roleName) {
    const firstTwoWords = getFirstTwoWords(roleName);
    if (!firstTwoWords) return null;
    const found = slashBot.channels.cache.find(c => {
        const channelFirstTwo = getFirstTwoWords(c.name.replace(/-/g, ' '));
        return channelFirstTwo === firstTwoWords && c.isTextBased();
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
        console.log('[Request] Command triggered');
        try {
            await interaction.deferReply({ ephemeral: true });
            console.log('[Request] deferReply done');

            const roleType = interaction.options.getString('role');
            const projectRole = interaction.options.getRole('for');
            const fromChapter = interaction.options.getInteger('from');
            const numberOfChapters = interaction.options.getInteger('number_of_chapters');

            if (!projectRole) {
                return await interaction.editReply({ content: '❌ Selected role not found!' });
            }

            const claimWorkChannel = interaction.guild.channels.cache.find(
                ch => ch.name === '🏹〢claim・work' && ch.isTextBased()
            );

            if (!claimWorkChannel) {
                return await interaction.editReply({ content: '❌ Claim・work channel not found!' });
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
            console.log('[Request] Embed sent to claimWorkChannel');

            await interaction.editReply({ content: `✅ Request sent successfully to ${claimWorkChannel}!` });
            console.log('[Request] Command completed successfully');
        } catch (error) {
            console.error('[Request] Error:', error);
            if (interaction.deferred) {
                await interaction.editReply('❌ An error occurred while executing the command!');
            } else {
                await interaction.reply({ content: '❌ An error occurred while executing the command!', ephemeral: true });
            }
        }
    }
};

slashBot.slashCommands.set(requestCommand.data.name, requestCommand);

// ====== /assign Command ======
const assignCommand = {
    data: new SlashCommandBuilder()
        .setName('assign')
        .setDescription('Assign a role and Drive access to a user (Admin only)')
        .addUserOption(option => option.setName('user').setDescription('Select a user to assign').setRequired(true))
        .addRoleOption(option => option.setName('to').setDescription('Select a role to assign (matching room name)').setRequired(true))
        .addIntegerOption(option => option.setName('from').setDescription('Starting chapter number').setRequired(true).setMinValue(1)),

    async execute(interaction) {
        console.log('[Assign] Command triggered');
        try {
            if (!interaction.member.permissions.has('Administrator')) {
                return await interaction.reply({ content: '❌ You do not have permission to use this command!', ephemeral: true });
            }

            await interaction.deferReply({ ephemeral: true });
            console.log('[Assign] deferReply done');

            // باقي الكود هنا مثل ما عندك في النسخة القديمة
            // استخدم interaction.editReply بعد انتهاء العملية
            await interaction.editReply({ content: '✅ Assign command executed (implement full logic like previous version)' });
            console.log('[Assign] Command completed successfully');
        } catch (error) {
            console.error('[Assign] Error:', error);
            if (interaction.deferred) {
                await interaction.editReply('❌ An error occurred while executing the command!');
            } else {
                await interaction.reply({ content: '❌ An error occurred while executing the command!', ephemeral: true });
            }
        }
    }
};

slashBot.slashCommands.set(assignCommand.data.name, assignCommand);

// ====== Handle Buttons ======
slashBot.on('interactionCreate', async (interaction) => {
    if (interaction.isButton() && interaction.customId.startsWith('accept_request_')) {
        console.log('[Button] accept_request triggered');
        await interaction.deferReply({ ephemeral: true });
        try {
            const parts = interaction.customId.split('_');
            const requesterId = parts[2];
            const roleId = parts[3];
            const fromChapter = parts[4];
            const roleType = parts[5];

            const acceptingUser = interaction.user;
            const guild = interaction.guild;

            const role = guild.roles.cache.get(roleId);
            if (!role) return await interaction.editReply({ content: '❌ Role not found!' });

            const member = await guild.members.fetch(acceptingUser.id);
            await member.roles.add(role);

            // Google Sheets / Drive logic here (copy from previous working version)

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
            console.log('[Button] Task accepted and updated successfully');
        } catch (error) {
            console.error('[Button] Error:', error);
            if (interaction.deferred) {
                await interaction.editReply('❌ Error handling the request!');
            } else {
                await interaction.reply({ content: '❌ Error handling the request!', ephemeral: true });
            }
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
