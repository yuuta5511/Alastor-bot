import { SlashCommandBuilder } from "discord.js";
import { google } from "googleapis";

// ====== /weeklies Command ======
const weekliesCommand = {
    data: new SlashCommandBuilder()
        .setName('weeklies')
        .setDescription('Send weekly Kakao links from the PROGRESS sheet')
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

    async execute(interaction) {
        try {
            await interaction.deferReply({ ephemeral: true });

            // ====== Setup Google Sheets ======
            const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
            const auth = new google.auth.GoogleAuth({
                credentials: creds,
                scopes: ['https://www.googleapis.com/auth/spreadsheets']
            });

            const authClient = await auth.getClient();
            const sheets = google.sheets({ version: 'v4', auth: authClient });

            const spreadsheetId = process.env.SHEET_ID;
            const sheetName = 'PROGRESS';

            // ====== Get Column B Data WITH HYPERLINKS ======
            const response = await sheets.spreadsheets.get({
                spreadsheetId,
                ranges: [`${sheetName}!B:B`],
                includeGridData: true
            });

            const rowData = response.data.sheets[0]?.data[0]?.rowData;
            if (!rowData || rowData.length === 0) {
                return interaction.editReply({ content: '❌ Sheet is empty!' });
            }

            // ====== Get Today's Day Name OR User's Choice ======
            const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
            const userChoice = interaction.options.getString('day');
            
            let todayName;
            if (userChoice) {
                todayName = userChoice;
                console.log(`📅 User selected: ${todayName}`);
            } else {
                const today = new Date();
                todayName = daysOfWeek[today.getDay()];
                console.log(`🗓️ Today is: ${todayName}`);
            }

            // ====== Find Today's Row and Collect Links ======
            let foundToday = false;
            let kakaoLinks = [];

            for (let i = 0; i < rowData.length; i++) {
                const cell = rowData[i]?.values?.[0]; // Column B cell
                if (!cell) continue;

                // Get cell display text
                const cellValue = cell.formattedValue || '';
                const cellLower = cellValue.toLowerCase().trim();

                // Check if cell has a hyperlink
                const hyperlink = cell.hyperlink;

                // Check if this cell is a day name
                const isDayName = daysOfWeek.some(day => cellLower === day);

                if (!foundToday && cellLower === todayName) {
                    // Found today's row, start collecting from next row
                    foundToday = true;
                    console.log(`✅ Found "${todayName}" at row ${i + 1}`);
                    continue;
                }

                if (foundToday) {
                    // If we hit another day name OR "end", stop
                    if (isDayName || cellLower === 'end') {
                        console.log(`🛑 Found "${cellValue}" at row ${i + 1}, stopping`);
                        break;
                    }

                    // Collect Kakao and Ridi links from hyperlinks
                    if (hyperlink && (hyperlink.includes('kakao') || hyperlink.includes('ridibooks.com'))) {
                        kakaoLinks.push(hyperlink);
                        console.log(`🔗 Found link: ${hyperlink}`);
                    }
                    // Also check cell text if it contains direct links
                    else if (cellValue.includes('kakao') || cellValue.includes('ridi') || cellValue.includes('http')) {
                        kakaoLinks.push(cellValue);
                        console.log(`🔗 Found link in text: ${cellValue}`);
                    }
                }
            }

            if (!foundToday) {
                return interaction.editReply({ 
                    content: `❌ Could not find "${todayName}" in column B!` 
                });
            }

            if (kakaoLinks.length === 0) {
                return interaction.editReply({ 
                    content: `⚠️ No Kakao/Ridi links found for ${todayName}!` 
                });
            }

            // ====== Find ☆kakao-provider Channel ======
            const targetChannel = interaction.guild.channels.cache.find(
                ch => ch.name === '☆kakao-provider' && ch.isTextBased()
            );

            if (!targetChannel) {
                return interaction.editReply({ 
                    content: '❌ Channel "☆kakao-provider" not found!' 
                });
            }

            // ====== Send Links to Channel WITH BUTTON ======
            const { ButtonBuilder, ButtonStyle, ActionRowBuilder } = await import('discord.js');
            
            const mention = '<@1165517026475917315>';
            const message = `${mention}\n\n**📚 Weekly Kakao/Ridi Links for ${todayName.toUpperCase()}:**\n\n${kakaoLinks.join('\n')}\n\n**When u done press this button:**`;

            // Create button with row indices
            const rowIndices = [];
            let tempFoundToday = false;
            for (let i = 0; i < rowData.length; i++) {
                const cell = rowData[i]?.values?.[0];
                if (!cell) continue;
                const cellValue = cell.formattedValue || '';
                const cellLower = cellValue.toLowerCase().trim();
                const isDayName = daysOfWeek.some(day => cellLower === day);
                
                if (!tempFoundToday && cellLower === todayName) {
                    tempFoundToday = true;
                    continue;
                }
                
                if (tempFoundToday) {
                    if (isDayName || cellLower === 'end') break;
                    const hyperlink = cell.hyperlink;
                    if ((hyperlink && (hyperlink.includes('kakao') || hyperlink.includes('ridibooks.com'))) ||
                        (cellValue.includes('kakao') || cellValue.includes('ridi') || cellValue.includes('http'))) {
                        rowIndices.push(i + 1); // Store 1-based row number
                    }
                }
            }

            const button = new ButtonBuilder()
                .setCustomId(`weeklies_done_${rowIndices.join(',')}`)
                .setLabel('All Done ✅')
                .setStyle(ButtonStyle.Success);

            const row = new ActionRowBuilder().addComponents(button);

            await targetChannel.send({
                content: message,
                components: [row],
                allowedMentions: { parse: ['roles'] }
            });

            await interaction.editReply({ 
                content: `✅ Sent ${kakaoLinks.length} Kakao/Ridi link(s) to ${targetChannel}!` 
            });

        } catch (error) {
            console.error('❌ Error in /weeklies command:', error);
            await interaction.editReply({ 
                content: '❌ An error occurred while fetching the links!' 
            });
        }
    }
};

export default weekliesCommand;
