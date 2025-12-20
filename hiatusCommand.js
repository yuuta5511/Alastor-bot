import { SlashCommandBuilder } from "discord.js";
import { google } from "googleapis";

const hiatusCommand = {
    data: new SlashCommandBuilder()
        .setName('hiatus')
        .setDescription('Register a hiatus period')
        .addStringOption(option =>
            option.setName('from')
                .setDescription('Start date (YYYY-MM-DD)')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('to')
                .setDescription('End date (YYYY-MM-DD)')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for hiatus')
                .setRequired(true)),

    async execute(interaction) {
        console.log(`/hiatus command triggered by ${interaction.user.tag}`);
        try {
            await interaction.deferReply({ ephemeral: true });

            const fromDate = interaction.options.getString('from');
            const toDate = interaction.options.getString('to');
            const reason = interaction.options.getString('reason');
            const user = interaction.user;
            const member = interaction.member;

            // Validate date format
            const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
            if (!dateRegex.test(fromDate) || !dateRegex.test(toDate)) {
                return interaction.editReply({ content: '❌ Invalid date format! Use YYYY-MM-DD (e.g., 2024-12-25)' });
            }

            // Validate dates are valid
            const startDate = new Date(fromDate);
            const endDate = new Date(toDate);
            
            if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
                return interaction.editReply({ content: '❌ Invalid dates provided!' });
            }

            if (endDate <= startDate) {
                return interaction.editReply({ content: '❌ End date must be after start date!' });
            }

            // Calculate days until hiatus ends
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const daysRemaining = Math.ceil((endDate - today) / (1000 * 60 * 60 * 24));

            // ====== Update Nickname ======
            const currentNick = member.nickname || member.user.username;
            const newNick = currentNick.includes('(hiatus)') 
                ? currentNick 
                : `${currentNick} (hiatus)`;

            try {
                await member.setNickname(newNick);
            } catch (nickError) {
                console.error('Error setting nickname:', nickError);
                // Continue even if nickname fails (might be server owner or permission issue)
            }

            // ====== Setup Google Sheets ======
            const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
            const auth = new google.auth.GoogleAuth({
                credentials: creds,
                scopes: ['https://www.googleapis.com/auth/spreadsheets']
            });

            const authClient = await auth.getClient();
            const sheets = google.sheets({ version: 'v4', auth: authClient });

            const spreadsheetId = process.env.SHEET_ID;
            const sheetName = 'Members';

            // ====== Get current sheet data ======
            const response = await sheets.spreadsheets.values.get({
                spreadsheetId,
                range: `${sheetName}!A:Q`
            });

            const rows = response.data.values || [];
            const username = user.username;

            // Find user in active columns (A-E) or inactive columns (G-K)
            let userFound = false;
            let userRowIndex = -1;
            let userColumn = '';

            // Search in active columns (A-E)
            const activeColumns = ['A', 'B', 'C', 'D', 'E'];
            for (const col of activeColumns) {
                const colIndex = col.charCodeAt(0) - 65; // A=0, B=1, etc.
                for (let i = 2; i < rows.length; i++) { // Start from row 3 (index 2)
                    if (rows[i][colIndex] === username) {
                        userFound = true;
                        userRowIndex = i;
                        userColumn = col;
                        break;
                    }
                }
                if (userFound) break;
            }

            // If not found in active, search in inactive columns (G-K)
            if (!userFound) {
                const inactiveColumns = ['G', 'H', 'I', 'J', 'K'];
                for (const col of inactiveColumns) {
                    const colIndex = col.charCodeAt(0) - 65;
                    for (let i = 2; i < rows.length; i++) {
                        if (rows[i][colIndex] === username) {
                            userFound = true;
                            userRowIndex = i;
                            userColumn = col;
                            break;
                        }
                    }
                    if (userFound) break;
                }
            }

            // ====== Find first empty row in column M (starting from row 3) ======
            const columnMData = rows.map(row => row[12] || ''); // Column M (index 12)
            let targetRow = 3; // Start from row 3
            for (let i = 2; i < columnMData.length + 10; i++) { // Check existing + some extra rows
                if (!columnMData[i] || columnMData[i].trim() === '') {
                    targetRow = i + 1; // Convert to 1-based row number
                    break;
                }
            }

            // ====== Batch update operations ======
            const batchUpdates = [];

            // Add user to column M
            batchUpdates.push({
                range: `${sheetName}!M${targetRow}`,
                values: [[username]]
            });

            // Add start date to column N
            batchUpdates.push({
                range: `${sheetName}!N${targetRow}`,
                values: [[fromDate]]
            });

            // Add end date to column O
            batchUpdates.push({
                range: `${sheetName}!O${targetRow}`,
                values: [[toDate]]
            });

            // Add days remaining to column P
            batchUpdates.push({
                range: `${sheetName}!P${targetRow}`,
                values: [[daysRemaining]]
            });

            // Add reason to column Q
            batchUpdates.push({
                range: `${sheetName}!Q${targetRow}`,
                values: [[reason]]
            });

            // Clear user from original position if found
            if (userFound && userRowIndex >= 0) {
                batchUpdates.push({
                    range: `${sheetName}!${userColumn}${userRowIndex + 1}`,
                    values: [['']]
                });
            }

            // Execute batch update
            await sheets.spreadsheets.values.batchUpdate({
                spreadsheetId,
                requestBody: {
                    valueInputOption: 'RAW',
                    data: batchUpdates
                }
            });

            console.log(`✅ Hiatus registered for ${username} in row ${targetRow}`);

            await interaction.editReply({ 
                content: `✅ Hiatus registered successfully!\n**From:** ${fromDate}\n**To:** ${toDate}\n**Days remaining:** ${daysRemaining}\n**Reason:** ${reason}` 
            });

        } catch (error) {
            console.error('Error in /hiatus command:', error);
            await interaction.editReply({ content: `❌ An error occurred: ${error.message}` });
        }
    }
};

export default hiatusCommand;
