// paymentSystem.js - Handle user registration for payment tracking
import { SlashCommandBuilder } from 'discord.js';
import { google } from 'googleapis';

const REGISTRATION_SHEET_ID = '167xw-xO0WcqllRhbChQ3vG_I4f9GqipmunditHFkpeg';
const MAIN_PAGE = 'Main';

// Initialize Google Sheets client
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

// ====== /register Command ======
export const registerCommand = {
    data: new SlashCommandBuilder()
        .setName('register')
        .setDescription('Register your payment information')
        .addStringOption(option =>
            option.setName('email')
                .setDescription('Your email address')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('payment_method')
                .setDescription('Choose your payment method')
                .setRequired(true)
                .addChoices(
                    { name: 'Binance', value: 'binance' },
                    { name: 'PayPal', value: 'paypal' }
                ))
        .addStringOption(option =>
            option.setName('payment_id')
                .setDescription('Your Binance ID or PayPal email/link')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('account_name')
                .setDescription('Your account name')
                .setRequired(true)),

    async execute(interaction) {
        try {
            await interaction.deferReply({ ephemeral: true });

            const username = interaction.user.username;
            const accountName = interaction.options.getString('account_name');
            const email = interaction.options.getString('email');
            const paymentMethod = interaction.options.getString('payment_method');
            const paymentId = interaction.options.getString('payment_id');

            // Check if user already registered
            const existingData = await sheetsClient.spreadsheets.values.get({
                spreadsheetId: REGISTRATION_SHEET_ID,
                range: `${MAIN_PAGE}!A:A`
            });

            const rows = existingData.data.values || [];
            const existingRow = rows.findIndex(row => row[0] === username);

            let binanceId = '';
            let paypalInfo = '';

            if (paymentMethod === 'binance') {
                binanceId = paymentId;
            } else {
                paypalInfo = paymentId;
            }

            const rowData = [username, accountName, email, binanceId, paypalInfo, 0]; // 0 for initial total points

            if (existingRow !== -1) {
                // Update existing registration
                const rowNumber = existingRow + 1;
                await sheetsClient.spreadsheets.values.update({
                    spreadsheetId: REGISTRATION_SHEET_ID,
                    range: `${MAIN_PAGE}!A${rowNumber}:E${rowNumber}`,
                    valueInputOption: 'RAW',
                    requestBody: {
                        values: [rowData.slice(0, 5)]
                    }
                });

                await interaction.editReply({
                    content: `✅ Registration updated successfully!\n` +
                             `**Username:** ${username}\n` +
                             `**Account Name:** ${accountName}\n` +
                             `**Email:** ${email}\n` +
                             `**Payment Method:** ${paymentMethod === 'binance' ? 'Binance' : 'PayPal'}\n` +
                             `**Payment ID:** ${paymentId}`
                });
            } else {
                // Append new registration
                await sheetsClient.spreadsheets.values.append({
                    spreadsheetId: REGISTRATION_SHEET_ID,
                    range: `${MAIN_PAGE}!A:F`,
                    valueInputOption: 'RAW',
                    insertDataOption: 'INSERT_ROWS',
                    requestBody: {
                        values: [rowData]
                    }
                });

                await interaction.editReply({
                    content: `✅ Registration successful!\n` +
                             `**Username:** ${username}\n` +
                             `**Account Name:** ${accountName}\n` +
                             `**Email:** ${email}\n` +
                             `**Payment Method:** ${paymentMethod === 'binance' ? 'Binance' : 'PayPal'}\n` +
                             `**Payment ID:** ${paymentId}\n\n` +
                             `You can now start tracking your work!`
                });
            }

            console.log(`✅ User ${username} registered/updated payment info`);

        } catch (error) {
            console.error('Error in /register command:', error);
            await interaction.editReply({
                content: `❌ An error occurred while registering: ${error.message}`
            });
        }
    }
};

// ====== Helper Function: Add Points to User ======
export async function addPointsToUser(username, points) {
    try {
        const response = await sheetsClient.spreadsheets.values.get({
            spreadsheetId: REGISTRATION_SHEET_ID,
            range: `${MAIN_PAGE}!A:F`
        });

        const rows = response.data.values || [];
        const userRowIndex = rows.findIndex(row => row[0] === username);

        if (userRowIndex === -1) {
            console.error(`❌ User ${username} not found in registration sheet`);
            return false;
        }

        const rowNumber = userRowIndex + 1;
        const currentPoints = parseFloat(rows[userRowIndex][5] || 0);
        const newPoints = currentPoints + points;

        await sheetsClient.spreadsheets.values.update({
            spreadsheetId: REGISTRATION_SHEET_ID,
            range: `${MAIN_PAGE}!F${rowNumber}`,
            valueInputOption: 'RAW',
            requestBody: {
                values: [[newPoints]]
            }
        });

        console.log(`✅ Added ${points} points to ${username}. New total: ${newPoints}`);
        return true;

    } catch (error) {
        console.error('Error adding points:', error);
        return false;
    }
}

export { sheetsClient as paymentSheetsClient };
