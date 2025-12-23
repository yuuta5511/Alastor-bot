import { Client, GatewayIntentBits, Collection, SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from "discord.js";
import { google } from "googleapis";
import { registerCommands } from './registerCommands.js';
import weekliesCommand from './weekliesCommand.js';
import hiatusCommand from './hiatusCommand.js';
import { handleWeeklyModal } from './autoWeeklies.js';
import { Client, GatewayIntentBits, Collection, SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits } from "discord.js";

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

// ====== Channel IDs Configuration ======
const CHANNEL_IDS = {
    CLAIM_WORK: '1447747886359253116',
    EMAILS: '1269706276779200607'
};

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

// ====== Helper Function: Find Subfolder by Name Patterns ======
async function findSubfolderByPatterns(drive, parentFolderId, patterns) {
    try {
        const response = await drive.files.list({
            q: `'${parentFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
            fields: 'files(id, name)',
            spaces: 'drive'
        });

        const folders = response.data.files || [];
        
        for (const pattern of patterns) {
            const found = folders.find(folder => 
                folder.name.toLowerCase() === pattern.toLowerCase()
            );
            if (found) {
                console.log(`✅ Found subfolder: ${found.name} (${found.id})`);
                return found.id;
            }
        }

        console.log(`⚠️ No subfolder found matching patterns: ${patterns.join(', ')}`);
        return null;
    } catch (error) {
        console.error('Error searching for subfolder:', error);
        return null;
    }
}

// ====== Helper Function: Give Drive Access Based on Role ======
async function giveDriveAccessByRole(drive, mainFolderId, userEmail, roleType) {
    try {
        await drive.permissions.create({
            fileId: mainFolderId,
            requestBody: { 
                role: 'reader', 
                type: 'user', 
                emailAddress: userEmail 
            },
            sendNotificationEmail: false,
        });
        console.log(`✅ Gave viewer access to main folder`);

        let subfolderPatterns = [];
        
        if (roleType === 'ED') {
            subfolderPatterns = ['ed', 'ED', 'ts', 'TS', 'Ts', 'Ed'];
        } else if (['KTL', 'CTL', 'JTL', 'PR'].includes(roleType)) {
            subfolderPatterns = ['tl', 'ktl', 'tlpr', 'ktl pr', 'tl/pr', 'tl&pr', 'TL & PR', 'ctl', 'jtl'];
        }

        if (subfolderPatterns.length === 0) {
            console.log(`⚠️ No subfolder patterns defined for role: ${roleType}`);
            return { success: true, message: 'Viewer access granted to main folder' };
        }

        const subfolderId = await findSubfolderByPatterns(drive, mainFolderId, subfolderPatterns);

        if (!subfolderId) {
            return { 
                success: true, 
                message: `Viewer access granted to main folder (no matching subfolder found for ${roleType})` 
            };
        }

        await drive.permissions.create({
            fileId: subfolderId,
            requestBody: { 
                role: 'writer', 
                type: 'user', 
                emailAddress: userEmail 
            },
            sendNotificationEmail: false,
        });
        console.log(`✅ Gave editor access to subfolder`);

        return { 
            success: true, 
            message: `Viewer access to main folder + Editor access to ${roleType} subfolder` 
        };

    } catch (error) {
        console.error('Error giving drive access:', error);
        return { 
            success: false, 
            message: `Error: ${error.message}` 
        };
    }
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

            const claimWorkChannel = interaction.guild.channels.cache.get(CHANNEL_IDS.CLAIM_WORK);

            if (!claimWorkChannel || !claimWorkChannel.isTextBased()) {
                return interaction.editReply({ content: '❌ Claim work channel not found or is not a text channel!' });
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

            await claimWorkChannel.send({ 
                content: roleMentions[roleType] || '',
                embeds: [embed], 
                components: [row],
                allowedMentions: { parse: ['roles'] }
            });

            await interaction.editReply({ content: `✅ Request sent successfully to ${claimWorkChannel}!` });

        } catch (error) {
            console.error('Error in /request command:', error);
            await interaction.editReply({ content: '❌ An error occurred while executing the command!' });
        }
    }
};
slashBot.slashCommands.set(requestCommand.data.name, requestCommand);

// ====== Helper Function: Detect Role Type from User's Roles ======
function detectRoleType(member) {
    const roleIds = {
        'ED': '1269706276288467057',
        'PR': '1269706276288467058',
        'KTL': '1270089817517981859',
        'CTL': '1269706276288467059',
        'JTL': '1288004879020724276',
    };

    for (const [roleType, roleId] of Object.entries(roleIds)) {
        if (member.roles.cache.has(roleId)) {
            return roleType;
        }
    }
    
    return null;
}

// ====== /assign Command ======
const assignCommand = {
    data: new SlashCommandBuilder()
        .setName('assign')
        .setDescription('Assign a user to a project with Drive access')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to assign')
                .setRequired(true))
        .addRoleOption(option =>
            option.setName('to')
                .setDescription('Select the project role')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('from')
                .setDescription('Starting chapter number')
                .setRequired(true)
                .setMinValue(1)),

    async execute(interaction) {
        console.log(`/assign command triggered by ${interaction.user.tag}`);
        try {
            await interaction.deferReply({ ephemeral: true });

            const targetUser = interaction.options.getUser('user');
            const projectRole = interaction.options.getRole('to');
            const fromChapter = interaction.options.getInteger('from');

            if (!targetUser) {
                return interaction.editReply({ content: '❌ User not found!' });
            }

            if (!projectRole) {
                return interaction.editReply({ content: '❌ Role not found!' });
            }

            const guild = interaction.guild;
            const member = await guild.members.fetch(targetUser.id).catch(() => null);
            
            if (!member) {
                return interaction.editReply({ content: '❌ User is not a member of this server!' });
            }
            
            await member.roles.add(projectRole);

            const emailsChannel = guild.channels.cache.get(CHANNEL_IDS.EMAILS);
            
            if (!emailsChannel || !emailsChannel.isTextBased()) {
                return interaction.editReply({ content: '❌ Emails channel not found or is not a text channel!' });
            }

            const messages = await emailsChannel.messages.fetch({ limit: 100 });
            const userMessages = messages.filter(msg => msg.author.id === targetUser.id);
            if (userMessages.size === 0) {
                return interaction.editReply({ content: '❌ No email found for this user in emails channel!' });
            }

            const lastUserMessage = userMessages.first();
            const userEmail = lastUserMessage.content.trim();

            // Detect role type from user's roles
            const roleType = detectRoleType(member);
            if (!roleType) {
                return interaction.editReply({ content: '❌ User does not have any recognized role (ED, PR, KTL, CTL, JTL)!' });
            }

            console.log(`Detected role type: ${roleType} for user ${targetUser.tag}`);

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
            if (driveColumnIndex === -1) return interaction.editReply({ content: '❌ V221 column not found!' });

            const roleFirstThree = getFirstThreeWords(projectRole.name);
            const projectRow = rows.find(row => row[0] && getFirstThreeWords(row[0]) === roleFirstThree);
            if (!projectRow) return interaction.editReply({ content: `❌ Project "${projectRole.name}" not found in spreadsheet!` });

            const driveLink = projectRow[driveColumnIndex];
            if (!driveLink) return interaction.editReply({ content: `❌ Found project row but V221 is empty!` });

            const fileIdMatch = driveLink.match(/[-\w]{25,}/);
            if (!fileIdMatch) return interaction.editReply({ content: '❌ Invalid Drive link!' });
            const folderId = fileIdMatch[0];

            // Use role-based Drive access (same as /request)
            const driveResult = await giveDriveAccessByRole(drive, folderId, userEmail, roleType);
            
            if (!driveResult.success) {
                return interaction.editReply({ 
                    content: `❌ Error giving Drive permission: ${driveResult.message}` 
                });
            }

            const targetChannel = findMatchingChannel(projectRole.name);
            if (targetChannel) {
                await targetChannel.send({
                    content: `${targetUser} start from ch ${fromChapter}, access granted ✅`,
                    allowedMentions: { parse: ['users'] }
                });
            }

            await interaction.editReply({ 
                content: `✅ Done! ${targetUser} received role ${projectRole.name} and Drive access.\n📁 ${driveResult.message}` 
            });

        } catch (error) {
            console.error('Error in /assign command:', error);
            await interaction.editReply({ content: '❌ An error occurred while executing the command!' });
        }
    }
};

slashBot.slashCommands.set(assignCommand.data.name, assignCommand);
slashBot.slashCommands.set(weekliesCommand.data.name, weekliesCommand);
slashBot.slashCommands.set(hiatusCommand.data.name, hiatusCommand);

// ====== /update-members Command ======
const updateMembersCommand = {
    data: new SlashCommandBuilder()
        .setName('update-members')
        .setDescription('Manually update the Members sheet with current activity'),

    async execute(interaction) {
        try {
            await interaction.deferReply({ ephemeral: true });
            
            console.log('📊 Manual update-members triggered by', interaction.user.tag);
            
            const { manualUpdateMembers } = await import('./memberActivityTracker.js');
            await manualUpdateMembers(interaction.client);
            
            await interaction.editReply({ content: '✅ Members sheet updated successfully!' });
        } catch (error) {
            console.error('❌ Error in /update-members:', error);
            await interaction.editReply({ content: `❌ Error updating Members sheet: ${error.message}` });
        }
    }
};

slashBot.slashCommands.set(updateMembersCommand.data.name, updateMembersCommand);

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

    // ====== Handle Weekly Fill Button - Show Modal ======
    if (interaction.isButton() && interaction.customId.startsWith('weekly_fill_')) {
        const sessionId = interaction.customId.replace('weekly_fill_', '');
        
        const modal = new ModalBuilder()
            .setCustomId(`weekly_modal_${sessionId}`)
            .setTitle('Chapter Details');

        const driveInput = new TextInputBuilder()
            .setCustomId('drive_link')
            .setLabel('Drive Link (or type "skip")')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('https://drive.google.com/drive/folders/...')
            .setRequired(true);

        const chapterInput = new TextInputBuilder()
            .setCustomId('chapter_number')
            .setLabel('Chapter Number')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g., 123')
            .setRequired(true);

        const firstRow = new ActionRowBuilder().addComponents(driveInput);
        const secondRow = new ActionRowBuilder().addComponents(chapterInput);

        modal.addComponents(firstRow, secondRow);

        await interaction.showModal(modal);
    }

    // ====== Handle Weekly Modal Submission ======
    if (interaction.isModalSubmit() && interaction.customId.startsWith('weekly_modal_')) {
        const sessionId = interaction.customId.replace('weekly_modal_', '');
        await handleWeeklyModal(interaction, sessionId);
    }

    // ====== Handle Accept Request Button with Drive Access ======
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

            const emailsChannel = guild.channels.cache.get(CHANNEL_IDS.EMAILS);
            
            if (!emailsChannel || !emailsChannel.isTextBased()) {
                return interaction.editReply({ content: '❌ Emails channel not found or is not a text channel!' });
            }

            const messages = await emailsChannel.messages.fetch({ limit: 100 });
            const userMessages = messages.filter(msg => msg.author.id === acceptingUser.id);
            if (userMessages.size === 0) {
                return interaction.editReply({ content: '❌ No previous email found in emails channel!' });
            }

            const lastUserMessage = userMessages.first();
            const userEmail = lastUserMessage.content.trim();

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

            const response = await sheets.spreadsheets.values.get({ 
                spreadsheetId, 
                range: `${sheetName}!A:ZZ` 
            });
            
            const rows = response.data.values;
            if (!rows || rows.length === 0) {
                return interaction.editReply({ content: '❌ Spreadsheet is empty!' });
            }

            const header = rows[0];
            const driveColumnIndex = header.findIndex(col => 
                col && typeof col === "string" && col.trim().toLowerCase() === "v221"
            );
            
            if (driveColumnIndex === -1) {
                return interaction.editReply({ content: '❌ V221 column not found!' });
            }

            const roleFirstThree = getFirstThreeWords(role.name);
            const projectRow = rows.find(row => 
                row[0] && getFirstThreeWords(row[0]) === roleFirstThree
            );
            
            if (!projectRow) {
                return interaction.editReply({ 
                    content: `❌ Project "${role.name}" not found in spreadsheet!` 
                });
            }

            const driveLink = projectRow[driveColumnIndex];
            if (!driveLink) {
                return interaction.editReply({ 
                    content: `❌ Found project row but V221 is empty!` 
                });
            }

            const fileIdMatch = driveLink.match(/[-\w]{25,}/);
            if (!fileIdMatch) {
                return interaction.editReply({ content: '❌ Invalid Drive link!' });
            }
            const folderId = fileIdMatch[0];

            const driveResult = await giveDriveAccessByRole(drive, folderId, userEmail, roleType);
            
            if (!driveResult.success) {
                return interaction.editReply({ 
                    content: `❌ Error giving Drive permission: ${driveResult.message}` 
                });
            }

            const targetChannel = findMatchingChannel(role.name);
            if (targetChannel) {
                await targetChannel.send({
                    content: `${acceptingUser} start from ch ${fromChapter}, access granted ✅`,
                    allowedMentions: { parse: ['users'] }
                });
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

            await interaction.message.edit({ 
                embeds: [updatedEmbed], 
                components: [newRow] 
            });

            await interaction.editReply({ 
                content: `✅ Done! You received role ${role.name} and Drive access.\n📁 ${driveResult.message}` 
            });

        } catch (error) {
            console.error('Error handling button:', error);
            await interaction.editReply({ content: '❌ Error handling the request!' });
        }
    }

    // ====== Handle "Cancel It!" Button for Hiatus ======
    if (interaction.isButton() && interaction.customId.startsWith('cancel_hiatus_')) {
        console.log(`Cancel hiatus button clicked by ${interaction.user.tag}`);
        try {
            const parts = interaction.customId.split('_');
            const userId = parts[2];
            const rowNumber = parseInt(parts[3]);

            if (interaction.user.id !== userId) {
                return interaction.reply({ 
                    content: '❌ You can only cancel your own hiatus!',
                    ephemeral: true 
                });
            }

            const disabledButton = new ButtonBuilder()
                .setCustomId('hiatus_cancelled')
                .setLabel('Cancelling...')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true);

            const newRow = new ActionRowBuilder().addComponents(disabledButton);
            
            const originalEmbed = interaction.message.embeds[0];
            const updatingEmbed = EmbedBuilder.from(originalEmbed)
                .setColor('#FFA500')
                .setTitle('🖐️ Cancelling Hiatus...');

            await interaction.update({ 
                embeds: [updatingEmbed], 
                components: [newRow] 
            });

            const member = interaction.member;
            const username = interaction.user.username;

            try {
                const currentNick = member.nickname || member.displayName;
                const newNick = currentNick
                    .replace(/\s*\(hiatus\)\s*/gi, '')
                    .replace(/\(hiatus\)/gi, '')
                    .trim();
                
                if (newNick && newNick !== currentNick) {
                    await member.setNickname(newNick === member.user.username ? null : newNick);
                    console.log(`✅ Removed (hiatus) from nickname`);
                }
            } catch (nickError) {
                console.error('❌ Error removing hiatus from nickname:', nickError);
            }

            const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
            const auth = new google.auth.GoogleAuth({
                credentials: creds,
                scopes: ['https://www.googleapis.com/auth/spreadsheets']
            });

            const authClient = await auth.getClient();
            const sheets = google.sheets({ version: 'v4', auth: authClient });

            const spreadsheetId = process.env.SHEET_ID;
            const sheetName = 'Members';

            const response = await sheets.spreadsheets.values.get({
                spreadsheetId,
                range: `${sheetName}!G:G`
            });

            const columnGData = response.data.values || [];
            let targetRow = 3;
            for (let i = 2; i < columnGData.length + 10; i++) {
                const cellValue = columnGData[i] ? columnGData[i][0] : '';
                if (!cellValue || cellValue.trim() === '') {
                    targetRow = i + 1;
                    break;
                }
            }

            await sheets.spreadsheets.values.batchUpdate({
                spreadsheetId,
                requestBody: {
                    valueInputOption: 'RAW',
                    data: [
                        {
                            range: `${sheetName}!G${targetRow}`,
                            values: [[username]]
                        },
                        {
                            range: `${sheetName}!M${rowNumber}:O${rowNumber}`,
                            values: [['', '', '']]
                        },
                        {
                            range: `${sheetName}!Q${rowNumber}`,
                            values: [['']]
                        }
                    ]
                }
            });

            const finalButton = new ButtonBuilder()
                .setCustomId('hiatus_cancelled')
                .setLabel('Hiatus Cancelled ✅')
                .setStyle(ButtonStyle.Success)
                .setDisabled(true);

            const finalRow = new ActionRowBuilder().addComponents(finalButton);
            
            const finalEmbed = EmbedBuilder.from(originalEmbed)
                .setColor('#808080')
                .setTitle('🖐️ Hiatus Cancelled')
                .setFooter({ text: 'You have been moved back to inactive members' });

            await interaction.editReply({ 
                embeds: [finalEmbed], 
                components: [finalRow] 
            });

            console.log(`✅ Hiatus cancelled for ${username}`);

        } catch (error) {
            console.error('Error handling cancel hiatus button:', error);
            
            try {
                await interaction.followUp({ 
                    content: `❌ Error cancelling hiatus: ${error.message}`,
                    ephemeral: true 
                });
            } catch (followUpError) {
                console.error('Could not send error message:', followUpError);
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
