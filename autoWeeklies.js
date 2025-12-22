import { google } from "googleapis";
import { ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder } from "discord.js";

// ====== Automatic Weeklies Scheduler ======
// Runs every day at 3:05 AM GMT+2

// Store active sessions (linkIndex -> session data)
const activeSessions = new Map();

export function startWeekliesScheduler(client) {
    console.log('📅 Weeklies scheduler started - will run daily at 3:05 AM GMT+2');

    setInterval(async () => {
        const now = new Date();
        const gmt2Time = new Date(now.toLocaleString('en-US', { timeZone: 'Africa/Cairo' }));
        const hours = gmt2Time.getHours();
        const minutes = gmt2Time.getMinutes();
        
        if (hours === 24 && minutes === 55) {
            console.log('⏰ It\'s 3:05 AM GMT+2 - Running automatic weeklies!');
            await sendWeeklies(client);
        }
    }, 60 * 1000);
}

async function sendWeeklies(client) {
    try {
        console.log('📄 Starting automatic weeklies process...');

        const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
        const auth = new google.auth.GoogleAuth({
            credentials: creds,
            scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive']
        });

        const authClient = await auth.getClient();
        const sheets = google.sheets({ version: 'v4', auth: authClient });

        const spreadsheetId = process.env.SHEET_ID;
        const sheetName = 'PROGRESS';

        // Get Column B Data WITH HYPERLINKS
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

        const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const today = new Date();
        const todayName = daysOfWeek[today.getDay()];

        console.log(`🗓️ Today is: ${todayName}`);

        // Find Today's Row and Collect Links with Row Numbers
        let foundToday = false;
        let linksData = []; // {link, rowNumber}

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
            console.error(`❌ Could not find "${todayName}" in column B!`);
            return;
        }

        if (linksData.length === 0) {
            console.log(`⚠️ No Kakao/Ridi links found for ${todayName}!`);
            return;
        }

        // Find ☆kakao-provider Channel
        const targetChannel = client.channels.cache.find(
            ch => ch.name === '☆kakao-provider' && ch.isTextBased()
        );

        if (!targetChannel) {
            console.error('❌ Channel "☆kakao-provider" not found!');
            return;
        }

        // Create session ID and store data
        const sessionId = Date.now().toString();
        activeSessions.set(sessionId, {
            linksData,
            currentIndex: 0,
            todayName,
            channelId: targetChannel.id
        });

        // Send first link
        await sendLinkMessage(client, sessionId);

        console.log(`✅ Started weeklies session with ${linksData.length} links`);

    } catch (error) {
        console.error('❌ Error in automatic weeklies:', error);
    }
}

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

// Handle modal submission
export async function handleWeeklyModal(interaction, sessionId) {
    try {
        await interaction.deferReply();

        const session = activeSessions.get(sessionId);
        if (!session) {
            return interaction.editReply({ content: '❌ Session expired or invalid!' });
        }

        const driveLink = interaction.fields.getTextInputValue('drive_link');
        const chapterNumber = interaction.fields.getTextInputValue('chapter_number');

        const { linksData, currentIndex } = session;
        const currentLink = linksData[currentIndex];

        // Check if user wants to skip
        if (driveLink.toLowerCase().trim() === 'skip') {
            session.currentIndex++;
            activeSessions.set(sessionId, session);
            
            await interaction.editReply({ content: '⏭️ Skipped this link.' });
            await sendLinkMessage(interaction.client, sessionId);
            return;
        }

        // Extract source folder ID from drive link
        const sourceFolderMatch = driveLink.match(/[-\w]{25,}/);
        if (!sourceFolderMatch) {
            return interaction.editReply({ content: '❌ Invalid Drive link!' });
        }
        const sourceFolderId = sourceFolderMatch[0];

        // Get destination folder ID from Config sheet
        const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
        const auth = new google.auth.GoogleAuth({
            credentials: creds,
            scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive']
        });

        const authClient = await auth.getClient();
        const sheets = google.sheets({ version: 'v4', auth: authClient });
        const drive = google.drive({ version: 'v3', auth: authClient });

        const spreadsheetId = process.env.SHEET_ID;
        
        // Get Config sheet, column D
        const configResponse = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `Config!D${currentLink.rowNumber}`
        });

        const destinationLink = configResponse.data.values?.[0]?.[0];
        if (!destinationLink) {
            return interaction.editReply({ 
                content: `❌ No destination folder found in Config sheet at row ${currentLink.rowNumber}!` 
            });
        }

        const destFolderMatch = destinationLink.match(/[-\w]{25,}/);
        if (!destFolderMatch) {
            return interaction.editReply({ content: '❌ Invalid destination folder link in Config sheet!' });
        }
        const destFolderId = destFolderMatch[0];

        await interaction.editReply({ content: '⏳ Processing images... This may take a moment.' });

        // List all image files in source folder
        const filesList = await drive.files.list({
            q: `'${sourceFolderId}' in parents and trashed=false and (mimeType contains 'image/')`,
            fields: 'files(id, name, mimeType)',
            pageSize: 1000
        });

        const files = filesList.data.files || [];
        
        if (files.length === 0) {
            await interaction.followUp({ content: '⚠️ No images found in source folder!' });
        } else {
            // Create new folder with chapter number in destination
            const newFolder = await drive.files.create({
                requestBody: {
                    name: `ch ${chapterNumber}`,
                    mimeType: 'application/vnd.google-apps.folder',
                    parents: [destFolderId]
                },
                fields: 'id'
            });

            const newFolderId = newFolder.data.id;

            // Copy all images to new folder
            let copiedCount = 0;
            for (const file of files) {
                try {
                    await drive.files.copy({
                        fileId: file.id,
                        requestBody: {
                            name: file.name,
                            parents: [newFolderId]
                        }
                    });
                    copiedCount++;
                } catch (copyError) {
                    console.error(`Error copying file ${file.name}:`, copyError);
                }
            }

            await interaction.followUp({ 
                content: `✅ Successfully copied ${copiedCount} images to folder "ch ${chapterNumber}"!` 
            });
        }

        // Move to next link
        session.currentIndex++;
        activeSessions.set(sessionId, session);
        
        await sendLinkMessage(interaction.client, sessionId);

    } catch (error) {
        console.error('❌ Error in handleWeeklyModal:', error);
        await interaction.followUp({ content: `❌ Error: ${error.message}` });
    }
}
