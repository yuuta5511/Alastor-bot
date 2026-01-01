import { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from "discord.js";
import { sheets, drive, spreadsheetId, sheetName } from './index.js';
import { getFirstThreeWords, findMatchingChannel, giveDriveAccessByRole } from './commands.js';

const progressSheetName = sheetName;
const CHANNEL_IDS = {
    EMAILS: '1269706276779200607'
};

// ====== Handle All Interactions (Buttons, Modals) ======
export async function handleInteractions(interaction, client) {
    
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

            const response = await sheets.spreadsheets.values.get({ 
                spreadsheetId, 
                range: `${progressSheetName}!A:ZZ` 
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

            const driveResult = await giveDriveAccessByRole(folderId, userEmail, roleType);
            
            if (!driveResult.success) {
                return interaction.editReply({ 
                    content: `❌ Error giving Drive permission: ${driveResult.message}` 
                });
            }

            const targetChannel = await findMatchingChannel(role.name, client);
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
}
