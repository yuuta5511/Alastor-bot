// seriesState.js - Handle /series state command
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { google } from 'googleapis';

const OLD_SHEET_ID = '1CKbgNt7yMMm3H_s6n3wxKVrDcedyEdZHDjKFUGFLlLU';
const CONFIG_PAGE = 'Config';
const WORKING_NOW_PAGE = 'Working now';
const PROGRESS_PAGE = 'PROGRESS';

const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
});

let sheetsClient;
(async () => {
    const client = await auth.getClient();
    sheetsClient = google.sheets({ version: 'v4', auth: client });
})();

// ====== Helper: Get Series Info from Channel ID ======
async function getSeriesInfoFromChannelId(channelId) {
    try {
        const response = await sheetsClient.spreadsheets.values.get({
            spreadsheetId: OLD_SHEET_ID,
            range: `${CONFIG_PAGE}!B:F`
        });

        const rows = response.data.values || [];
        
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const configChannelId = row[4]?.trim(); // Column F
            
            if (configChannelId === channelId) {
                return {
                    seriesName: row[0] || '',
                    rowNumber: i + 1
                };
            }
        }

        return null;
    } catch (error) {
        console.error('Error getting series info:', error);
        return null;
    }
}

// ====== Helper: Get Progress Data ======
async function getProgressData(rowNumber) {
    try {
        const response = await sheetsClient.spreadsheets.values.get({
            spreadsheetId: OLD_SHEET_ID,
            range: `${PROGRESS_PAGE}!D${rowNumber}:P${rowNumber}`
        });

        const row = response.data.values?.[0] || [];
        
        return {
            raw: parseInt(row[0] || 0),      // Column D (index 0)
            ed: parseInt(row[10] || 0),      // Column N (index 10)
            pr: parseInt(row[11] || 0),      // Column O (index 11)
            tl: parseInt(row[12] || 0)       // Column P (index 12)
        };
    } catch (error) {
        console.error('Error getting progress data:', error);
        return { raw: 0, ed: 0, pr: 0, tl: 0 };
    }
}

// ====== Helper: Get Current Workers ======
async function getCurrentWorkers(channelId) {
    try {
        const response = await sheetsClient.spreadsheets.values.get({
            spreadsheetId: OLD_SHEET_ID,
            range: `${WORKING_NOW_PAGE}!A:F`
        });

        const rows = response.data.values || [];
        const workers = [];

        for (const row of rows) {
            const workChannelId = row[5]?.trim(); // Column F
            
            if (workChannelId === channelId) {
                workers.push({
                    username: row[0] || '',        // Column A
                    chapter: parseInt(row[2] || 0), // Column C
                    role: row[3] || '',            // Column D
                    timestamp: row[4] || ''        // Column E
                });
            }
        }

        return workers;
    } catch (error) {
        console.error('Error getting current workers:', error);
        return [];
    }
}

// ====== Helper: Calculate Hours Ago ======
function getHoursAgo(timestamp) {
    try {
        const past = new Date(timestamp);
        const now = new Date();
        const diffMs = now - past;
        const hours = Math.floor(diffMs / (1000 * 60 * 60));
        return hours;
    } catch (error) {
        return 0;
    }
}

// ====== Helper: Determine Chapter Progress ======
function getChapterProgress(chapterNum, progress) {
    if (chapterNum > progress.tl) {
        return 'RAW➔TL';
    } else if (chapterNum > progress.pr) {
        return 'TL➔PR';
    } else if (chapterNum > progress.ed) {
        return 'PR➔ED';
    }
    return 'DONE'; // Shouldn't happen in the list
}

// ====== /series state Command ======
export const seriesStateCommand = {
    data: new SlashCommandBuilder()
        .setName('series')
        .setDescription('Check series progress')
        .addSubcommand(subcommand =>
            subcommand
                .setName('state')
                .setDescription('View progress of all ongoing chapters in this series')),

    async execute(interaction) {
        try {
            await interaction.deferReply();

            const channelId = interaction.channelId;

            // Get series info from channel ID
            const seriesInfo = await getSeriesInfoFromChannelId(channelId);
            
            if (!seriesInfo) {
                return interaction.editReply({
                    content: '❌ This channel is not associated with any series in the Config sheet!'
                });
            }

            // Get progress data
            const progress = await getProgressData(seriesInfo.rowNumber);
            
            // Calculate ongoing chapters (ED + 1 to RAW)
            const startChapter = progress.ed + 1;
            const endChapter = progress.raw;

            if (startChapter > endChapter) {
                return interaction.editReply({
                    content: `📊 **${seriesInfo.seriesName}**\n\n✅ All available chapters are completed!\n\n` +
                             `**Progress:**\n` +
                             `• RAW: ${progress.raw}\n` +
                             `• TL: ${progress.tl}\n` +
                             `• PR: ${progress.pr}\n` +
                             `• ED: ${progress.ed}`
                });
            }

            // Get current workers
            const workers = await getCurrentWorkers(channelId);

            // Build chapter list
            let chapterList = '';
            
            for (let ch = startChapter; ch <= endChapter; ch++) {
                const chProgress = getChapterProgress(ch, progress);
                let line = `**Ch ${ch}:** ${chProgress}`;

                // Check if someone is working on this chapter
                const worker = workers.find(w => w.chapter === ch);
                if (worker) {
                    const hoursAgo = getHoursAgo(worker.timestamp);
                    line += ` | Working: @${worker.username} (${worker.role}) - ${hoursAgo}h ago`;
                }

                chapterList += line + '\n';
            }

            const embed = new EmbedBuilder()
                .setColor('#00BFFF')
                .setTitle(`📊 ${seriesInfo.seriesName} - Progress Status`)
                .setDescription(
                    `**Overall Progress:**\n` +
                    `• RAW: ${progress.raw}\n` +
                    `• TL: ${progress.tl}\n` +
                    `• PR: ${progress.pr}\n` +
                    `• ED: ${progress.ed}\n\n` +
                    `**Ongoing Chapters (${startChapter}-${endChapter}):**\n${chapterList}`
                )
                .setTimestamp()
                .setFooter({ text: `Requested by ${interaction.user.username}` });

            await interaction.editReply({ embeds: [embed] });

            console.log(`✅ Series state shown for ${seriesInfo.seriesName} by ${interaction.user.username}`);

        } catch (error) {
            console.error('Error in /series state command:', error);
            await interaction.editReply({
                content: `❌ An error occurred: ${error.message}`
            });
        }
    }
};
