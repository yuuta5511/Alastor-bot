import { Client, GatewayIntentBits, Collection, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { google } from "googleapis";
import { registerCommands } from './registerCommands.js';
import weekliesCommand from './weekliesCommand.js';
import hiatusCommand from './hiatusCommand.js';
import { handleWeeklyModal } from './autoWeeklies.js';
import { requestCommand, assignCommand, updateMembersCommand, handleAcceptButton } from './projectCommands.js';

// ====== GOOGLE SHEET SETUP ======
const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);

const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive']
});

const authClient = await auth.getClient();
export const sheets = google.sheets({ version: 'v4', auth: authClient });
export const drive = google.drive({ version: 'v3', auth: authClient });

export const spreadsheetId = process.env.SHEET_ID;
export const progressSheetName = process.env.SHEET_NAME || 'PROGRESS';
export const configSheetName = 'Config';

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

// ====== Register Commands ======
slashBot.slashCommands.set(requestCommand.data.name, requestCommand);
slashBot.slashCommands.set(assignCommand.data.name, assignCommand);
slashBot.slashCommands.set(weekliesCommand.data.name, weekliesCommand);
slashBot.slashCommands.set(hiatusCommand.data.name, hiatusCommand);
slashBot.slashCommands.set(updateMembersCommand.data.name, updateMembersCommand);

// ====== Handle Interactions ======
slashBot.on('interactionCreate', async (interaction) => {
    // Handle slash commands
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
        await handleAcceptButton(interaction);
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

            await sheets.spreadsheets.values.batchUpdate({
                spreadsheetId,
                requestBody: {
                    valueInputOption: 'RAW',
                    data: [
                        {
                            range: `Members!G${rowNumber}`,
                            values: [[username]]
                        },
                        {
                            range: `Members!M${rowNumber}:O${rowNumber}`,
                            values: [['', '', '']]
                        },
                        {
                            range: `Members!Q${rowNumber}`,
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
