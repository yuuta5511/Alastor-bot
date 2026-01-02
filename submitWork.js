// submitWork.js - Handle /submit command
import { SlashCommandBuilder } from 'discord.js';
import { google } from 'googleapis';
import { addPointsToUser } from './paymentSystem.js';

const OLD_SHEET_ID = '1CKbgNt7yMMm3H_s6n3wxKVrDcedyEdZHDjKFUGFLlLU';
const CONFIG_PAGE = 'Config';
const WORKING_NOW_PAGE = 'Working now';
const LOG_PAGE = 'Log';
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

// ====== Helper: Get All Channels from Config ======
async function getAllChannelsFromConfig() {
    try {
        const response = await sheetsClient.spreadsheets.values.get({
            spreadsheetId: OLD_SHEET_ID,
            range: `${CONFIG_PAGE}!B:F`
        });

        const rows = response.data.values || [];
        const channels = [];

        for (const row of rows) {
            const seriesName = row[0]?.trim();
            const channelId = row[4]?.trim();
            
            if (seriesName && channelId) {
                channels.push({
                    name: seriesName,
                    value: channelId
                });
            }
        }

        return channels;
    } catch (error) {
        console.error('Error getting channels:', error);
        return [];
    }
}

// ====== Helper: Find Work in "Working now" ======
async function findWorkInProgress(username, channelId, chapterNum) {
    try {
        const response = await sheetsClient.spreadsheets.values.get({
            spreadsheetId: OLD_SHEET_ID,
            range: `${WORKING_NOW_PAGE}!A:F`
        });

        const rows = response.data.values || [];

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const workUsername = row[0]?.trim();
            const workSeriesName = row[1]?.trim();
            const workChapter = row[2]?.toString().trim();
            const workRole = row[3]?.trim();
            const workChannelId = row[5]?.trim();

            if (workUsername === username && 
                workChannelId === channelId && 
                workChapter === chapterNum.toString()) {
                return {
                    found: true,
                    rowNumber: i + 1,
                    seriesName: workSeriesName,
                    role: workRole
                };
            }
        }

        return { found: false };
    } catch (error) {
        console.error('Error finding work in progress:', error);
        return { found: false };
    }
}

// ====== Helper: Remove Work from "Working now" ======
async function removeFromWorkingNow(rowNumber) {
    try {
        await sheetsClient.spreadsheets.batchUpdate({
            spreadsheetId: OLD_SHEET_ID,
            requestBody: {
                requests: [{
                    deleteDimension: {
                        range: {
                            sheetId: await getSheetId(WORKING_NOW_PAGE),
                            dimension: 'ROWS',
                            startIndex: rowNumber - 1,
                            endIndex: rowNumber
                        }
                    }
                }]
            }
        });
        return true;
    } catch (error) {
        console.error('Error removing from Working now:', error);
        return false;
    }
}

// ====== Helper: Get Sheet ID ======
async function getSheetId(sheetName) {
    try {
        const response = await sheetsClient.spreadsheets.get({
            spreadsheetId: OLD_SHEET_ID
        });

        const sheet = response.data.sheets.find(s => s.properties.title === sheetName);
        return sheet?.properties?.sheetId || 0;
    } catch (error) {
        console.error('Error getting sheet ID:', error);
        return 0;
    }
}

// ====== Helper: Update Progress in PROGRESS Sheet ======
async function updateProgress(channelId, chapterNum, role) {
    try {
        // Find row number from Config
        const configResponse = await sheetsClient.spreadsheets.values.get({
            spreadsheetId: OLD_SHEET_ID,
            range: `${CONFIG_PAGE}!F:F`
        });

        const configRows = configResponse.data.values || [];
        let rowNumber = -1;

        for (let i = 0; i < configRows.length; i++) {
            if (configRows[i][0]?.trim() === channelId) {
                rowNumber = i + 1;
                break;
            }
        }

        if (rowNumber === -1) return false;

        // Determine which column to update based on role
        let column = '';
        if (role === 'ED') column = 'N';
        else if (['KTL', 'JTL', 'CTL'].includes(role)) column = 'P';
        else if (role === 'PR') column = 'O';
        else return false;

        await sheetsClient.spreadsheets.values.update({
            spreadsheetId: OLD_SHEET_ID,
            range: `${PROGRESS_PAGE}!${column}${rowNumber}`,
            valueInputOption: 'RAW',
            requestBody: {
                values: [[chapterNum]]
            }
        });

        return true;
    } catch (error) {
        console.error('Error updating progress:', error);
        return false;
    }
}

// ====== Helper: Get Point Rate from Config ======
async function getPointRate(channelId, role) {
    try {
        const response = await sheetsClient.spreadsheets.values.get({
            spreadsheetId: OLD_SHEET_ID,
            range: `${CONFIG_PAGE}!F:I`
        });

        const rows = response.data.values || [];

        for (const row of rows) {
            const configChannelId = row[0]?.trim();
            
            if (configChannelId === channelId) {
                // Column G (index 1) for TL, H (index 2) for PR, I (index 3) for ED
                if (['KTL', 'JTL', 'CTL'].includes(role)) {
                    return parseFloat(row[1] || 0);
                } else if (role === 'PR') {
                    return parseFloat(row[2] || 0);
                } else if (role === 'ED') {
                    return parseFloat(row[3] || 0);
                }
            }
        }

        return 0;
    } catch (error) {
        console.error('Error getting point rate:', error);
        return 0;
    }
}

// ====== Helper: Add to Log ======
async function addToLog(username, seriesName, chapterNum, role, timestamp, channelId, points) {
    try {
        const rowData = [
            username,
            seriesName,
            chapterNum,
            role,
            timestamp,
            channelId,
            points
        ];

        await sheetsClient.spreadsheets.values.append({
            spreadsheetId: OLD_SHEET_ID,
            range: `${LOG_PAGE}!A:G`,
            valueInputOption: 'RAW',
            insertDataOption: 'INSERT_ROWS',
            requestBody: {
                values: [rowData]
            }
        });

        return true;
    } catch (error) {
        console.error('Error adding to log:', error);
        return false;
    }
}

// ====== /submit Command ======
export const submitCommand = {
    data: new SlashCommandBuilder()
        .setName('submit')
        .setDescription('Submit completed work')
        .addStringOption(option =>
            option.setName('series')
                .setDescription('Select the series')
                .setRequired(true)
                .setAutocomplete(true))
        .addIntegerOption(option =>
            option.setName('chapter')
                .setDescription('Chapter number')
                .setRequired(true)
                .setMinValue(1))
        .addStringOption(option =>
            option.setName('role')
                .setDescription('Your role for this work')
                .setRequired(true)
                .addChoices(
                    { name: 'Editor (ED)', value: 'ED' },
                    { name: 'Translator (TL)', value: 'TL' },
                    { name: 'Proofreader (PR)', value: 'PR' }
                )),

    async autocomplete(interaction) {
        const channels = await getAllChannelsFromConfig();
        const focusedValue = interaction.options.getFocused().toLowerCase();
        
        const filtered = channels
            .filter(choice => choice.name.toLowerCase().includes(focusedValue))
            .slice(0, 25);

        await interaction.respond(filtered);
    },

    async execute(interaction) {
        try {
            await interaction.deferReply({ ephemeral: true });

            const username = interaction.user.username;
            const channelId = interaction.options.getString('series');
            const chapterNum = interaction.options.getInteger('chapter');
            let role = interaction.options.getString('role');

            // Normalize TL to proper role type
            if (role === 'TL') {
                // Default to KTL, but this could be improved by checking user's actual role
                role = 'KTL';
            }

            // Find work in "Working now"
            const workInfo = await findWorkInProgress(username, channelId, chapterNum);

            if (!workInfo.found) {
                return interaction.editReply({
                    content: `❌ No matching work found in "Working now" sheet!\n` +
                             `Make sure you've started this work by sending a message in the work tracking channel first.`
                });
            }

            // Get series name from Config
            const configResponse = await sheetsClient.spreadsheets.values.get({
                spreadsheetId: OLD_SHEET_ID,
                range: `${CONFIG_PAGE}!B:F`
            });

            const configRows = configResponse.data.values || [];
            let seriesName = '';

            for (const row of configRows) {
                if (row[4]?.trim() === channelId) {
                    seriesName = row[0]?.trim() || '';
                    break;
                }
            }

            if (!seriesName) {
                return interaction.editReply({
                    content: '❌ Could not find series information!'
                });
            }

            // Remove from "Working now"
            await removeFromWorkingNow(workInfo.rowNumber);

            // Update progress in PROGRESS sheet
            await updateProgress(channelId, chapterNum, role);

            // Get point rate
            const points = await getPointRate(channelId, role);

            // Add to Log
            const timestamp = new Date().toISOString();
            await addToLog(username, seriesName, chapterNum, role, timestamp, channelId, points);

            // Add points to user's total
            await addPointsToUser(username, points);

            await interaction.editReply({
                content: `✅ Work submitted successfully!\n\n` +
                         `**Series:** ${seriesName}\n` +
                         `**Chapter:** ${chapterNum}\n` +
                         `**Role:** ${role}\n` +
                         `**Points Earned:** ${points}\n\n` +
                         `Your total points have been updated!`
            });

            console.log(`✅ ${username} submitted ${seriesName} Ch${chapterNum} (${role}) - ${points} points`);

        } catch (error) {
            console.error('Error in /submit command:', error);
            await interaction.editReply({
                content: `❌ An error occurred: ${error.message}`
            });
        }
    }
};
