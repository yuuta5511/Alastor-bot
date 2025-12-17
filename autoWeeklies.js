import { google } from "googleapis";

// ====== Automatic Weeklies Scheduler ======
// Runs every day at 3:05 AM GMT+2

export function startWeekliesScheduler(client) {
    console.log('📅 Weeklies scheduler started - will run daily at 3:05 AM GMT+2');

    // Check every minute if it's time to run
    setInterval(async () => {
        const now = new Date();
        
        // Convert to GMT+2 timezone
        const gmt2Time = new Date(now.toLocaleString('en-US', { timeZone: 'Africa/Cairo' })); // GMT+2
        
        const hours = gmt2Time.getHours();
        const minutes = gmt2Time.getMinutes();
        
        // Run at 3:05 AM
        if (hours === 23 && minutes === 55) {
            console.log('⏰ It\'s 3:05 AM GMT+2 - Running automatic weeklies!');
            await sendWeeklies(client);
        }
    }, 60 * 1000); // Check every minute
}

async function sendWeeklies(client) {
    try {
        console.log('🔄 Starting automatic weeklies process...');

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
            console.error('❌ Sheet is empty!');
            return;
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

                // Collect Kakao and Ridi links from hyperlinks
                if (hyperlink && (hyperlink.includes('kakao') || hyperlink.includes('ridibooks.com'))) {
                    kakaoLinks.push(hyperlink);
                    console.log(`🔗 Found link: ${hyperlink}`);
                }
                else if (cellValue.includes('kakao') || cellValue.includes('ridi') || cellValue.includes('http')) {
                    kakaoLinks.push(cellValue);
                    console.log(`🔗 Found link in text: ${cellValue}`);
                }
            }
        }

        if (!foundToday) {
            console.error(`❌ Could not find "${todayName}" in column B!`);
            return;
        }

        if (kakaoLinks.length === 0) {
            console.log(`⚠️ No Kakao/Ridi links found for ${todayName}!`);
            return;
        }

        // ====== Find ☆kakao-provider Channel ======
        const targetChannel = client.channels.cache.find(
            ch => ch.name === '☆kakao-provider' && ch.isTextBased()
        );

        if (!targetChannel) {
            console.error('❌ Channel "☆kakao-provider" not found!');
            return;
        }

        // ====== Send Links to Channel WITH BUTTON ======
        const { ButtonBuilder, ButtonStyle, ActionRowBuilder } = await import('discord.js');
        
        const mention = '<@1165517026475917315>';
        const message = `${mention}\n\n**📚 Weekly Kakao/Ridi Links for ${todayName.toUpperCase()}:**\n\n${kakaoLinks.join('\n')}\n\n**When u done press this button:**`;

        // Create button with row indices encoded
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

        console.log(`✅ Automatically sent ${kakaoLinks.length} Kakao/Ridi link(s) to ${targetChannel.name}!`);

    } catch (error) {
        console.error('❌ Error in automatic weeklies:', error);
    }
}
