import { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from "discord.js";
import { google } from "googleapis";

const hiatusCommand = {
    data: new SlashCommandBuilder()
        .setName('hiatus')
        .setDescription('Manage your hiatus status')
        .addSubcommand(subcommand =>
            subcommand
                .setName('register')
                .setDescription('Register a new hiatus period')
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
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('state')
                .setDescription('Check your current hiatus status')),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'register') {
            await handleRegister(interaction);
        } else if (subcommand === 'state') {
            await handleState(interaction);
        }
    }
};

async function handleRegister(interaction) {
    console.log(`/hiatus register command triggered by ${interaction.user.tag}`);
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
            return interaction.editReply({ content: '❌ Invalid date format! Use YYYY-MM-DD (e.g., 2026-01-01)' });
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

        // ⭐ NEW: Check if hiatus period exceeds 7 days
        const diffTime = Math.abs(endDate - startDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays > 7) {
            return interaction.editReply({ 
                content: '❌ Your max hiatus period is 7 days, if you need more you have to contact a supervisor with a strong reason' 
            });
        }

        // ====== Update Nickname ======
        try {
            // ⭐ CHANGED: Use display name (nickname or global name) instead of username
            const currentNick = member.nickname || member.displayName;
            const newNick = currentNick.includes('(hiatus)') 
                ? currentNick 
                : `${currentNick} (hiatus)`;

            await member.setNickname(newNick);
            console.log(`✅ Nickname updated to: ${newNick}`);
        } catch (nickError) {
            console.error('❌ Error setting nickname:', nickError);
            await interaction.followUp({ 
                content: '⚠️ Could not update nickname (missing permissions or you are server owner). Continuing with hiatus registration...', 
                ephemeral: true 
            });
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
        const columnMData = rows.map(row => row[12] || '');
        let targetRow = 3;
        for (let i = 2; i < columnMData.length + 10; i++) {
            if (!columnMData[i] || columnMData[i].trim() === '') {
                targetRow = i + 1;
                break;
            }
        }

        // ====== Batch update operations ======
        const batchUpdates = [];

        // Column M: Username
        batchUpdates.push({
            range: `${sheetName}!M${targetRow}`,
            values: [[username]]
        });

        // Column N: Start Date
        batchUpdates.push({
            range: `${sheetName}!N${targetRow}`,
            values: [[fromDate]]
        });

        // Column O: End Date
        batchUpdates.push({
            range: `${sheetName}!O${targetRow}`,
            values: [[toDate]]
        });

        // Column P: Will have formula =O-N (set manually in sheet)
        // We don't write to P, the formula calculates days remaining

        // Column Q: Reason
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
                valueInputOption: 'USER_ENTERED', // ⭐ CHANGED: Use USER_ENTERED instead of RAW to treat dates properly
                data: batchUpdates
            }
        });

        console.log(`✅ Hiatus registered for ${username} in row ${targetRow}`);

        await interaction.editReply({ 
            content: `✅ Hiatus registered successfully!\n**From:** ${fromDate}\n**To:** ${toDate}\n**Duration:** ${diffDays} day(s)\n**Reason:** ${reason}` 
        });

    } catch (error) {
        console.error('Error in /hiatus register:', error);
        await interaction.editReply({ content: `❌ An error occurred: ${error.message}` });
    }
}

async function handleState(interaction) {
    console.log(`/hiatus state command triggered by ${interaction.user.tag}`);
    try {
        await interaction.deferReply({ ephemeral: true });

        const user = interaction.user;
        const username = user.username;

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

        // ====== Get hiatus data (M to Q) ======
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `${sheetName}!M:Q`
        });

        const rows = response.data.values || [];
        
        // Find user's hiatus entry
        let hiatusFound = false;
        let hiatusData = null;
        let rowNumber = -1;

        for (let i = 2; i < rows.length; i++) {
            const row = rows[i];
            if (row && row[0] === username) {
                hiatusFound = true;
                rowNumber = i + 1;
                hiatusData = {
                    startDate: row[1] || 'N/A',
                    endDate: row[2] || 'N/A',
                    daysRemaining: row[3] || 'N/A', // Column P (index 3)
                    reason: row[4] || 'No reason provided' // Column Q (index 4)
                };
                break;
            }
        }

        if (!hiatusFound) {
            return interaction.editReply({ 
                content: '❌ You are not currently on hiatus!' 
            });
        }

        // Create embed
        const embed = new EmbedBuilder()
            .setColor('#FFA500')
            .setTitle('🖐️ Your Hiatus Status')
            .addFields(
                { name: '📅 Start Date', value: hiatusData.startDate, inline: true },
                { name: '📅 End Date', value: hiatusData.endDate, inline: true },
                { name: '⏳ Days Left', value: hiatusData.daysRemaining.toString(), inline: true },
                { name: '📝 Reason', value: hiatusData.reason, inline: false }
            )
            .setTimestamp();

        // Create cancel button
        const cancelButton = new ButtonBuilder()
            .setCustomId(`cancel_hiatus_${user.id}_${rowNumber}`)
            .setLabel('Cancel It!')
            .setStyle(ButtonStyle.Danger);

        const row = new ActionRowBuilder().addComponents(cancelButton);

        await interaction.editReply({ 
            embeds: [embed],
            components: [row]
        });

    } catch (error) {
        console.error('Error in /hiatus state:', error);
        await interaction.editReply({ content: `❌ An error occurred: ${error.message}` });
    }
}

export default hiatusCommand;
