import { google } from "googleapis";
import { ButtonBuilder, ButtonStyle, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from "discord.js";

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
        if (hours === 24 && minutes === 45) {
            console.log('⏰ It\'s 3:05 AM GMT+2 - Running automatic weeklies!');
            await sendWeeklies(client);
        }
    }, 60 * 1000); // Check every minute
}

async function sendWeeklies(client) {
    try {
        console.log('🔄 Starting automatic weeklies process...');

        // ====== Setup Google Sheets & Drive ======
        const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
        const auth = new google.auth.GoogleAuth({
            credentials: creds,
            scopes: [
                'https://www.googleapis.com/auth/spreadsheets',
                'https://www.googleapis.com/auth/drive'
            ]
        });

        const authClient = await auth.getClient();
        const sheets = google.sheets({ version: 'v4', auth: authClient });
        const drive = google.drive({ version: 'v3', auth: authClient });

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

        // ====== Get Config Sheet for Destination Folders ======
        const configResponse = await sheets.spreadsheets.get({
            spreadsheetId,
            ranges: ['Config!D:D'],
            includeGridData: true
        });

        const configData = configResponse.data.sheets[0]?.data[0]?.rowData || [];

        // ====== Get Today's Day Name ======
        const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const today = new Date();
        const todayName = daysOfWeek[today.getDay()];

        console.log(`🗓️ Today is: ${todayName}`);

        // ====== Find Today's Row and Collect Links with Row Numbers ======
        let foundToday = false;
        let linkData = []; // Array of {link, rowNumber}

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
                    linkData.push({ link: hyperlink, rowNumber: i + 1 });
                    console.log(`🔗 Found link at row ${i + 1}: ${hyperlink}`);
                }
                else if (cellValue.includes('kakao') || cellValue.includes('ridi') || cellValue.includes('http')) {
                    linkData.push({ link: cellValue, rowNumber: i + 1 });
                    console.log(`🔗 Found link in text at row ${i + 1}: ${cellValue}`);
                }
            }
        }

        if (!foundToday) {
            console.error(`❌ Could not find "${todayName}" in column B!`);
            return;
        }

        if (linkData.length === 0) {
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

        // ====== Send First Link with Input Fields ======
        const mention = '<@1165517026475917315>';
        const firstLinkData = linkData[0];
        
        // Get destination folder ID from Config sheet
        const destinationFolderId = getDestinationFolderId(configData, firstLinkData.rowNumber);

        const message = `${mention}\n\n**📚 Weekly Kakao/Ridi Links for ${todayName.toUpperCase()}**\n\n` +
                       `**Link ${1}/${linkData.length}:**\n${firstLinkData.link}\n\n` +
                       `Please fill in the details and click Next:`;

        // Create message with custom ID containing all needed data
        const customId = `weeklies_input_0_${linkData.map(d => `${d.rowNumber}`).join(',')}_${destinationFolderId || 'none'}`;
        
        const button = new ButtonBuilder()
            .setCustomId(customId)
            .setLabel('Open Input Form')
            .setStyle(ButtonStyle.Primary);

        const row = new ActionRowBuilder().addComponents(button);

        await targetChannel.send({
            content: message,
            components: [row],
            allowedMentions: { parse: ['users'] }
        });

        console.log(`✅ Automatically sent link 1/${linkData.length} to ${targetChannel.name}!`);

    } catch (error) {
        console.error('❌ Error in automatic weeklies:', error);
    }
}

// Helper function to get destination folder ID from Config sheet
function getDestinationFolderId(configData, rowNumber) {
    try {
        if (rowNumber <= configData.length) {
            const cell = configData[rowNumber - 1]?.values?.[0];
            const folderId = cell?.formattedValue || '';
            
            // Extract folder ID from link if it's a full URL
            const match = folderId.match(/[-\w]{25,}/);
            return match ? match[0] : folderId;
        }
    } catch (error) {
        console.error('Error getting destination folder ID:', error);
    }
    return null;
}

// ====== Handle Button Interactions for Weeklies ======
export async function handleWeekliesButton(interaction) {
    if (!interaction.customId.startsWith('weeklies_input_')) return false;

    try {
        const parts = interaction.customId.split('_');
        const currentIndex = parseInt(parts[2]);
        const rowNumbers = parts[3].split(',').map(n => parseInt(n));
        const destinationBase = parts[4];

        // Get the current link to display in modal title
        const sheets = google.sheets({ version: 'v4', auth: await getAuthClient() });
        const spreadsheetId = process.env.SHEET_ID;
        
        const response = await sheets.spreadsheets.get({
            spreadsheetId,
            ranges: ['PROGRESS!B:B'],
            includeGridData: true
        });

        const rowData = response.data.sheets[0]?.data[0]?.rowData || [];
        const currentRowNumber = rowNumbers[currentIndex];

        // Show modal for input
        const modal = new ModalBuilder()
            .setCustomId(`weeklies_modal_${currentIndex}_${parts[3]}_${destinationBase}`)
            .setTitle(`Chapter Info - ${currentIndex + 1}/${rowNumbers.length}`);

        const driveInput = new TextInputBuilder()
            .setCustomId('drive_link')
            .setLabel('Drive Link (or type "skip")')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('https://drive.google.com/... or skip')
            .setRequired(true);

        const chapterInput = new TextInputBuilder()
            .setCustomId('chapter_number')
            .setLabel('Chapter Number')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g., 42')
            .setRequired(true);

        const firstRow = new ActionRowBuilder().addComponents(driveInput);
        const secondRow = new ActionRowBuilder().addComponents(chapterInput);

        modal.addComponents(firstRow, secondRow);

        await interaction.showModal(modal);
        return true;

    } catch (error) {
        console.error('Error showing modal:', error);
        return false;
    }
}

// ====== Handle Modal Submissions for Weeklies ======
export async function handleWeekliesModal(interaction) {
    if (!interaction.customId.startsWith('weeklies_modal_')) return false;

    try {
        await interaction.deferReply({ ephemeral: false });

        const parts = interaction.customId.split('_');
        const currentIndex = parseInt(parts[2]);
        const rowNumbers = parts[3].split(',').map(n => parseInt(n));
        const destinationBase = parts[4];

        const driveLink = interaction.fields.getTextInputValue('drive_link').trim();
        const chapterNumber = interaction.fields.getTextInputValue('chapter_number').trim();

        // ====== Process the current link ======
        if (driveLink.toLowerCase() !== 'skip') {
            await interaction.editReply({ content: '⏳ Processing images... Please wait.' });

            const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
            const auth = new google.auth.GoogleAuth({
                credentials: creds,
                scopes: ['https://www.googleapis.com/auth/drive']
            });

            const authClient = await auth.getClient();
            const drive = google.drive({ version: 'v3', auth: authClient });

            // Extract source folder ID
            const sourceFolderMatch = driveLink.match(/[-\w]{25,}/);
            if (!sourceFolderMatch) {
                await interaction.editReply({ content: '❌ Invalid Drive link!' });
                return true;
            }
            const sourceFolderId = sourceFolderMatch[0];

            // Get destination folder from Config
            const spreadsheetId = process.env.SHEET_ID;
            const sheets = google.sheets({ version: 'v4', auth: authClient });
            
            const configResponse = await sheets.spreadsheets.get({
                spreadsheetId,
                ranges: ['Config!D:D'],
                includeGridData: true
            });

            const configData = configResponse.data.sheets[0]?.data[0]?.rowData || [];
            const currentRowNumber = rowNumbers[currentIndex];
            const destinationFolderId = getDestinationFolderId(configData, currentRowNumber);

            if (!destinationFolderId || destinationFolderId === 'none') {
                await interaction.editReply({ 
                    content: `❌ No destination folder found in Config sheet for row ${currentRowNumber}!` 
                });
                return true;
            }

            // Create new folder with chapter number
            const newFolder = await drive.files.create({
                requestBody: {
                    name: chapterNumber,
                    mimeType: 'application/vnd.google-apps.folder',
                    parents: [destinationFolderId]
                },
                fields: 'id'
            });

            const newFolderId = newFolder.data.id;
            console.log(`✅ Created folder "${chapterNumber}" in destination`);

            // Get all images from source folder
            const fileList = await drive.files.list({
                q: `'${sourceFolderId}' in parents and trashed=false`,
                fields: 'files(id, name, mimeType)',
                pageSize: 1000
            });

            const images = fileList.data.files.filter(file => 
                file.mimeType.startsWith('image/')
            );

            if (images.length === 0) {
                await interaction.editReply({ 
                    content: `⚠️ No images found in source folder! Moving to next link...` 
                });
            } else {
                // Copy each image to new folder
                let copiedCount = 0;
                for (const image of images) {
                    try {
                        await drive.files.copy({
                            fileId: image.id,
                            requestBody: {
                                name: image.name,
                                parents: [newFolderId]
                            }
                        });
                        copiedCount++;
                    } catch (copyError) {
                        console.error(`Error copying ${image.name}:`, copyError);
                    }
                }

                await interaction.editReply({ 
                    content: `✅ Copied ${copiedCount} image(s) to folder "${chapterNumber}"!` 
                });
                console.log(`✅ Copied ${copiedCount} images to chapter ${chapterNumber}`);
            }
        } else {
            await interaction.editReply({ content: '⏭️ Skipped this link.' });
        }

        // ====== Move to Next Link or Finish ======
        const nextIndex = currentIndex + 1;

        if (nextIndex < rowNumbers.length) {
            // Get next link from PROGRESS sheet
            const sheets = google.sheets({ version: 'v4', auth: await getAuthClient() });
            const spreadsheetId = process.env.SHEET_ID;
            
            const response = await sheets.spreadsheets.get({
                spreadsheetId,
                ranges: ['PROGRESS!B:B'],
                includeGridData: true
            });

            const rowData = response.data.sheets[0]?.data[0]?.rowData || [];
            const nextRowNumber = rowNumbers[nextIndex];
            const nextCell = rowData[nextRowNumber - 1]?.values?.[0];
            const nextLink = nextCell?.hyperlink || nextCell?.formattedValue || 'Unknown link';

            const nextMessage = `**Link ${nextIndex + 1}/${rowNumbers.length}:**\n${nextLink}\n\n` +
                               `Please fill in the details and click Next:`;

            const customId = `weeklies_input_${nextIndex}_${parts[3]}_${destinationBase}`;
            
            const button = new ButtonBuilder()
                .setCustomId(customId)
                .setLabel('Open Input Form')
                .setStyle(ButtonStyle.Primary);

            const row = new ActionRowBuilder().addComponents(button);

            await interaction.followUp({
                content: nextMessage,
                components: [row]
            });

        } else {
            // All done - notify supervisor
            const supervisorMention = '<@&1269706276309569581>';
            await interaction.followUp({
                content: `${supervisorMention} All chapters processed and uploaded! ✅`,
                allowedMentions: { parse: ['roles'] }
            });
            console.log('✅ All weeklies processed!');
        }

        return true;

    } catch (error) {
        console.error('Error handling modal submission:', error);
        try {
            await interaction.editReply({ 
                content: `❌ Error processing: ${error.message}` 
            });
        } catch (e) {
            console.error('Could not send error message');
        }
        return false;
    }
}

async function getAuthClient() {
    const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
    const auth = new google.auth.GoogleAuth({
        credentials: creds,
        scopes: [
            'https://www.googleapis.com/auth/spreadsheets',
            'https://www.googleapis.com/auth/drive'
        ]
    });
    return auth.getClient();
}
