import { SlashCommandBuilder } from "discord.js";
import { google } from "googleapis";

// ====== /weeklies Command ======
const weekliesCommand = {
    data: new SlashCommandBuilder()
        .setName('weeklies')
        .setDescription('Send weekly Kakao links from the PROGRESS sheet'),

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

            // ====== Get Today's Day Name ======
            const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
            const today = new Date();
            const todayName = daysOfWeek[today.getDay()];

            console.log(`🗓️ Today is: ${todayName}`);

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

                    // Collect Kakao links from hyperlinks
                    if (hyperlink && hyperlink.includes('kakao')) {
                        kakaoLinks.push(hyperlink);
                        console.log(`🔗 Found link: ${hyperlink}`);
                    }
                    // Also check cell text if it contains direct links
                    else if (cellValue.includes('kakao') || cellValue.includes('http')) {
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
                    content: `⚠️ No Kakao links found for ${todayName}!` 
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

            // ====== Send Links to Channel ======
            const mention = '<@&1165517026475917315>';
            const message = `${mention}\n\n**📚 Weekly Kakao Links for ${todayName.toUpperCase()}:**\n\n${kakaoLinks.join('\n')}`;

            await targetChannel.send({
                content: message,
                allowedMentions: { parse: ['roles'] }
            });

            await interaction.editReply({ 
                content: `✅ Sent ${kakaoLinks.length} Kakao link(s) to ${targetChannel}!` 
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
