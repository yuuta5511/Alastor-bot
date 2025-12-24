import { google } from "googleapis";
import { ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder } from "discord.js";
import { activeSessions } from './weekliesCommand.js';

// ====== Automatic Weeklies Scheduler ======
// Runs every day at 3:05 AM GMT+2

export function startWeekliesScheduler(client) {
    console.log('📅 Weeklies scheduler started - will run daily at 3:05 AM GMT+2');

    setInterval(async () => {
        const now = new Date();
        const gmt2Time = new Date(now.toLocaleString('en-US', { timeZone: 'Africa/Cairo' }));
        const hours = gmt2Time.getHours();
        const minutes = gmt2Time.getMinutes();
        
        if (hours === 15 && minutes === 5) {
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
            scopes: ['https://www.googleapis.com/auth/spreadsheets']
        });

        const authClient = await auth.getClient();
        const sheets = google.sheets({ version: 'v4', auth: authClient });

        const spreadsheetId = process.env.SHEET_ID;
        const sheetName = 'PROGRESS';

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
            console.error(`❌ Could not find "${todayName}" in column B!`);
            return;
        }

        if (linksData.length === 0) {
            console.log(`⚠️ No Kakao/Ridi links found for ${todayName}!`);
            return;
        }

        const targetChannel = client.channels.cache.find(
            ch => ch.name === '☆kakao-provider' && ch.isTextBased()
        );

        if (!targetChannel) {
            console.error('❌ Channel "☆kakao-provider" not found!');
            return;
        }

        const sessionId = Date.now().toString();
        activeSessions.set(sessionId, {
            linksData,
            currentIndex: 0,
            todayName,
            channelId: targetChannel.id
        });

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

// Create OAuth2 client for Drive operations
function createOAuthClient() {
    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_OAUTH_CLIENT_ID,
        process.env.GOOGLE_OAUTH_CLIENT_SECRET,
        process.env.GOOGLE_OAUTH_REDIRECT_URI
    );

    oauth2Client.setCredentials({
        refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN
    });

    return oauth2Client;
}

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

        if (driveLink.toLowerCase().trim() === 'skip') {
            session.currentIndex++;
            activeSessions.set(sessionId, session);
            
            await interaction.editReply({ content: '⏭️ Skipped this link.' });
            await sendLinkMessage(interaction.client, sessionId);
            return;
        }

        const sourceFolderMatch = driveLink.match(/[-\w]{25,}/);
        if (!sourceFolderMatch) {
            return interaction.editReply({ content: '❌ Invalid Drive link!' });
        }
        const sourceFolderId = sourceFolderMatch[0];

        // Use service account for Sheets
        const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
        const sheetsAuth = new google.auth.GoogleAuth({
            credentials: creds,
            scopes: ['https://www.googleapis.com/auth/spreadsheets']
        });
        const sheetsAuthClient = await sheetsAuth.getClient();
        const sheets = google.sheets({ version: 'v4', auth: sheetsAuthClient });

        // Use OAuth for Drive (your personal account)
        const oauthClient = createOAuthClient();
        const drive = google.drive({ version: 'v3', auth: oauthClient });

        const spreadsheetId = process.env.SHEET_ID;
        
        const configResponse = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `Config!C${currentLink.rowNumber}`
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

        // List ALL files in source folder
        let filesList;
        try {
            filesList = await drive.files.list({
                q: `'${sourceFolderId}' in parents and trashed=false`,
                fields: 'files(id, name, mimeType, fileExtension)',
                pageSize: 1000,
                supportsAllDrives: true,
                includeItemsFromAllDrives: true
            });
        } catch (listError) {
            console.error('❌ Error listing files:', listError);
            return interaction.editReply({ 
                content: `❌ Cannot access the source folder!\n\nMake sure the folder is:\n` +
                `1. Shared with your Google account\n` +
                `2. Or set to "Anyone with the link" can view\n\n` +
                `Then try again.`
            });
        }

        const allFiles = filesList.data.files || [];
        console.log(`📁 Found ${allFiles.length} total files in source folder`);
        
        // Filter for image files
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.ico', '.tiff', '.tif'];
        const files = allFiles.filter(file => {
            const hasImageMime = file.mimeType && file.mimeType.startsWith('image/');
            const hasImageExt = imageExtensions.some(ext => 
                file.name.toLowerCase().endsWith(ext)
            );
            return hasImageMime || hasImageExt;
        });
        
        console.log(`🖼️ Filtered to ${files.length} image files`);
        
        if (files.length === 0) {
            await interaction.followUp({ 
                content: `⚠️ No images found in source folder!\n📊 Total files found: ${allFiles.length}\n💡 Make sure the folder contains image files (.jpg, .png, etc.)` 
            });
        } else {
            // Create new folder in destination
            const newFolder = await drive.files.create({
                requestBody: {
                    name: `ch ${chapterNumber}`,
                    mimeType: 'application/vnd.google-apps.folder',
                    parents: [destFolderId]
                },
                fields: 'id',
                supportsAllDrives: true
            });

            const newFolderId = newFolder.data.id;
            console.log(`📁 Created folder: ch ${chapterNumber} (${newFolderId})`);

            let copiedCount = 0;
            let failedCount = 0;
            
            for (const file of files) {
                try {
                    await drive.files.copy({
                        fileId: file.id,
                        requestBody: {
                            name: file.name,
                            parents: [newFolderId]
                        },
                        supportsAllDrives: true
                    });
                    copiedCount++;
                    console.log(`✅ Copied: ${file.name}`);
                } catch (copyError) {
                    failedCount++;
                    console.error(`❌ Error copying file ${file.name}:`, copyError.message);
                }
            }

            let resultMessage = `✅ Successfully copied ${copiedCount}/${files.length} images to folder "ch ${chapterNumber}"!`;
            if (failedCount > 0) {
                resultMessage += `\n⚠️ ${failedCount} file(s) failed to copy. Check bot logs.`;
            }
            
            await interaction.followUp({ content: resultMessage });
        }

        session.currentIndex++;
        activeSessions.set(sessionId, session);
        
        await sendLinkMessage(interaction.client, sessionId);

    } catch (error) {
        console.error('❌ Error in handleWeeklyModal:', error);
        try {
            await interaction.followUp({ content: `❌ Error: ${error.message}` });
        } catch (followUpError) {
            console.error('Could not send error message:', followUpError);
        }
    }
}
