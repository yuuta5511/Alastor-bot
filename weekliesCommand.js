import { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from "discord.js";
import { google } from "googleapis";

// Import the session storage from autoWeeklies (we'll share it)
const activeSessions = new Map();

export { activeSessions }; // Export so autoWeeklies.js can also use it

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
                scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive']
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

            // ====== Find Today's Row and Collect Links with Row Numbers ======
            let foundToday = false;
            let linksData = [];

            for (let i = 0; i < rowData.length; i++) {
                const cell = rowData[i]?.values?.[0];
                if (!cell) continue;

                const cellValue = cell.formattedValue || '';
                const cellLower = cellValue.toLowerCase().trim();
                const hyperlink = cell.hyperlink;

                const isDayName = daysOfWeek.some(day => cellLower === day);

                if (!foundToday && cellLower === todayName) {
                    foundToday = true;
                    console.log(`✅ Found "${todayName}" at row ${i + 1}`);
                    continue;
                }

                if (foundToday) {
                    if (isDayName || cellLower === 'end') {
                        console.log(`🛑 Found "${cellValue}" at row ${i + 1}, stopping`);
                        break;
                    }

                    if (hyperlink && (hyperlink.includes('kakao') || hyperlink.includes('ridibooks.com'))) {
                        linksData.push({ link: hyperlink, rowNumber: i + 1 });
                        console.log(`🔗 Found link: ${hyperlink} at row ${i + 1}`);
                    } else if (cellValue.includes('kakao') || cellValue.includes('ridi') || cellValue.includes('http')) {
                        linksData.push({ link: cellValue, rowNumber: i + 1 });
                        console.log(`🔗 Found link in text: ${cellValue} at row ${i + 1}`);
                    }
                }
            }

            if (!foundToday) {
                return interaction.editReply({ 
                    content: `❌ Could not find "${todayName}" in column B!` 
                });
            }

            if (linksData.length === 0) {
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

            // ====== Create Session and Send First Link ======
            const sessionId = Date.now().toString();
            activeSessions.set(sessionId, {
                linksData,
                currentIndex: 0,
                todayName,
                channelId: targetChannel.id
            });

            // Send first link
            await sendLinkMessage(interaction.client, sessionId);

            await interaction.editReply({ 
                content: `✅ Started sending ${linksData.length} link(s) to ${targetChannel}!` 
            });

        } catch (error) {
            console.error('❌ Error in /weeklies command:', error);
            await interaction.editReply({ 
                content: '❌ An error occurred while fetching the links!' 
            });
        }
    }
};

// Helper function to send link message
async function sendLinkMessage(client, sessionId) {
    const session = activeSessions.get(sessionId);
    if (!session) return;

    const { linksData, currentIndex, todayName, channelId } = session;
    const channel = client.channels.cache.get(channelId);
    
    if (!channel) return;

    if (currentIndex >= linksData.length) {
        // All links processed
        await channel.send({
            content: '<@&1269706276309569581> ✅ All weekly links have been processed!',
            allowedMentions: { parse: ['roles'] }
        });
        activeSessions.delete(sessionId);
        return;
    }

    const currentLink = linksData[currentIndex];
    const mention = '<@1165517026475917315>';

    const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle(`📚 Weekly Link for ${todayName.toUpperCase()}`)
        .setDescription(`**Link ${currentIndex + 1} of ${linksData.length}**\n\n${currentLink.link}`)
        .setFooter({ text: `Row ${currentLink.rowNumber}` })
        .setTimestamp();

    const button = new ButtonBuilder()
        .setCustomId(`weekly_fill_${sessionId}`)
        .setLabel('Fill Chapter Details 📝')
        .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder().addComponents(button);

    await channel.send({
        content: mention,
        embeds: [embed],
        components: [row],
        allowedMentions: { parse: ['users'] }
    });
}

export default weekliesCommand;
