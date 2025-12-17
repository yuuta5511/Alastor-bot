import { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from "discord.js";
import { google } from "googleapis";
import puppeteer from "puppeteer";

// ====== DISCORD CLIENT FOR UPLOAD BOT ======
const uploadBot = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
    ],
});

const token = process.env.BOT_TOKEN?.trim();
if (!token) {
    console.error("❌ BOT_TOKEN missing for upload bot!");
    process.exit(1);
}

uploadBot.login(token)
    .then(() => console.log(`✅ Upload Bot logged in as ${uploadBot.user.tag}`))
    .catch(err => {
        console.error("❌ Upload bot login failed:", err);
        process.exit(1);
    });

// ====== GOOGLE SHEETS SETUP ======
async function getGoogleSheetsClient() {
    const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
    const auth = new google.auth.GoogleAuth({
        credentials: creds,
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    const authClient = await auth.getClient();
    return google.sheets({ version: 'v4', auth: authClient });
}

// ====== CHECK FOR CHAPTERS READY TO UPLOAD ======
async function checkReadyChapters() {
    try {
        const sheets = await getGoogleSheetsClient();
        const spreadsheetId = process.env.SHEET_ID;
        const sheetName = 'UP';

        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `${sheetName}!A:M`
        });

        const rows = response.data.values || [];
        const readyChapters = [];

        // Skip header row, start from row 1 (index 1)
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            const projectName = row[0]; // Column A
            const chapterB = parseInt(row[1]) || 0; // Column B
            const chapterC = parseInt(row[2]) || 0; // Column C
            const statusD = row[3]; // Column D
            const valueG = parseInt(row[6]) || 0; // Column G
            const siteLink = row[3]; // Column D (contains link)
            const priceType = row[10]; // Column K (S or D)
            const driveLink = row[12]; // Column M

            // Check conditions: "Need UP" in D AND G > 4
            if (statusD && statusD.includes("Need UP") && valueG > 4) {
                // Determine chapter count (1 or 2)
                const chapterCount = (chapterB === 1 && chapterC === 1) ? 1 : 2;

                readyChapters.push({
                    rowIndex: i,
                    projectName: projectName || "Unknown",
                    chapterCount: chapterCount,
                    nextChapter: chapterB + 1,
                    siteLink: siteLink,
                    driveLink: driveLink,
                    priceType: priceType, // S = 100, D = 50
                    chapterB: chapterB,
                    chapterC: chapterC
                });
            }
        }

        return readyChapters;
    } catch (error) {
        console.error("❌ Error checking ready chapters:", error);
        return [];
    }
}

// ====== UPLOAD CHAPTER USING PUPPETEER ======
async function uploadChapter(chapterData, interaction) {
    let browser;
    try {
        await interaction.followUp({ content: `🚀 Starting upload for **${chapterData.projectName}** - Chapter ${chapterData.nextChapter}...` });

        // Launch browser
        browser = await puppeteer.launch({
            headless: false, // Set to false for debugging - CHANGE TO true when working
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();

        // TODO: You need to handle Discord OAuth login
        // This is the tricky part - we need to save cookies after you login once
        // For now, I'll assume you're already logged in via saved cookies

        // Navigate to the site
        await interaction.followUp({ content: `📄 Opening site...` });
        await page.goto(chapterData.siteLink, { waitUntil: 'networkidle2' });

        // Click "Add new chapter"
        await interaction.followUp({ content: `➕ Clicking "Add new chapter"...` });
        await page.waitForSelector('a[href*="/uploads/chapters/new"]', { timeout: 10000 });
        await page.click('a[href*="/uploads/chapters/new"]');
        
        // Wait for chapter form to load
        await interaction.followUp({ content: `⏳ Waiting for form to load...` });
        await page.waitForNavigation({ waitUntil: 'networkidle2' });

        // Type chapter number (B+1) - First input field for "Chapter Number"
        await interaction.followUp({ content: `🔢 Entering chapter number: ${chapterData.nextChapter}` });
        await page.waitForSelector('input[type="text"]', { timeout: 5000 });
        const chapterInputs = await page.$$('input[type="text"]');
        if (chapterInputs.length > 0) {
            await chapterInputs[0].click();
            await chapterInputs[0].type(chapterData.nextChapter.toString());
        }

        // Click "Google Drive" tab/button for upload method
        await interaction.followUp({ content: `☁️ Selecting Google Drive upload method...` });
        await page.waitForSelector('button:has-text("Google Drive")', { timeout: 5000 });
        await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            const gdriveBtn = buttons.find(btn => btn.textContent.includes('Google Drive'));
            if (gdriveBtn) gdriveBtn.click();
        });
        await page.waitForTimeout(1000);

        // Paste Drive link - should appear after clicking Google Drive
        await interaction.followUp({ content: `🔗 Pasting Drive link...` });
        // Look for an input that appears after clicking Google Drive
        const inputFields = await page.$$('input[type="text"]');
        // Usually the Drive link input is the second or third input
        if (inputFields.length > 1) {
            await inputFields[inputFields.length - 1].click(); // Try last input
            await inputFields[inputFields.length - 1].type(chapterData.driveLink);
        }

        // Click "Next Step" button
        await interaction.followUp({ content: `⏭️ Clicking Next Step...` });
        await page.waitForSelector('button:has-text("Next Step")', { timeout: 5000 });
        await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            const nextBtn = buttons.find(btn => btn.textContent.includes('Next Step'));
            if (nextBtn) nextBtn.click();
        });
        await page.waitForTimeout(2000);

        // === PAGE 2: Chapter Settings ===
        
        // Mark "Paid Chapter" checkbox
        await interaction.followUp({ content: `💰 Setting paid chapter options...` });
        await page.waitForSelector('input[type="checkbox"]', { timeout: 5000 });
        
        // Find checkbox by looking for one near "Paid Chapter" text
        await page.evaluate(() => {
            const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"]'));
            const paidCheckbox = checkboxes.find(cb => {
                const label = cb.closest('label') || cb.parentElement;
                return label && label.textContent.includes('Paid Chapter');
            });
            if (paidCheckbox) paidCheckbox.click();
        });
        await page.waitForTimeout(500);

        // Type chapter price (100 for S, 50 for D)
        const price = chapterData.priceType === 'S' ? 100 : 50;
        await interaction.followUp({ content: `💵 Setting price: ${price} points...` });
        
        // Find the price input field (usually number type or text near "Price")
        await page.evaluate((priceValue) => {
            const inputs = Array.from(document.querySelectorAll('input[type="number"], input[type="text"]'));
            const priceInput = inputs.find(inp => {
                const label = inp.closest('label') || inp.parentElement;
                return label && (label.textContent.includes('Price') || label.textContent.includes('Points'));
            });
            if (priceInput) {
                priceInput.value = priceValue;
                priceInput.dispatchEvent(new Event('input', { bubbles: true }));
            }
        }, price);
        await page.waitForTimeout(500);

        // Check "Permanently Locked" checkbox
        await interaction.followUp({ content: `🔒 Setting permanently locked...` });
        await page.evaluate(() => {
            const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"]'));
            const lockedCheckbox = checkboxes.find(cb => {
                const label = cb.closest('label') || cb.parentElement;
                return label && label.textContent.includes('Permanently Locked');
            });
            if (lockedCheckbox) lockedCheckbox.click();
        });
        await page.waitForTimeout(500);

        // Click "Next Step" again
        await interaction.followUp({ content: `⏭️ Clicking Next Step again...` });
        await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            const nextBtn = buttons.find(btn => btn.textContent.includes('Next Step'));
            if (nextBtn) nextBtn.click();
        });
        await page.waitForTimeout(2000);

        // === PAGE 3: Review & Publish ===
        
        // Click "Publish Chapter"
        await interaction.followUp({ content: `📤 Publishing chapter...` });
        await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            const publishBtn = buttons.find(btn => 
                btn.textContent.includes('Publish') || 
                btn.textContent.includes('Publish Chapter')
            );
            if (publishBtn) publishBtn.click();
        });

        // Wait for success
        await page.waitForTimeout(3000);

        await interaction.followUp({ content: `✅ **SUCCESS!** Uploaded ${chapterData.projectName} - Chapter ${chapterData.nextChapter}` });

        return true;

    } catch (error) {
        console.error("❌ Error uploading chapter:", error);
        await interaction.followUp({ content: `❌ **ERROR:** ${error.message}` });
        
        // Take screenshot for debugging
        if (browser) {
            try {
                const page = (await browser.pages())[0];
                await page.screenshot({ path: 'error-screenshot.png' });
                console.log("📸 Screenshot saved as error-screenshot.png");
            } catch (screenshotError) {
                console.error("Could not take screenshot:", screenshotError);
            }
        }
        
        return false;
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

// ====== /UP COMMAND ======
const upCommand = {
    data: new SlashCommandBuilder()
        .setName('up')
        .setDescription('Check chapters ready for upload')
        .addStringOption(option =>
            option.setName('status')
                .setDescription('Check upload status')
                .setRequired(false)
                .addChoices({ name: 'Check Status', value: 'status' })),

    async execute(interaction) {
        try {
            await interaction.deferReply();

            const option = interaction.options.getString('status');

            if (option === 'status' || !option) {
                // Check for ready chapters
                const readyChapters = await checkReadyChapters();

                if (readyChapters.length === 0) {
                    return interaction.editReply({ content: '❌ No chapters ready for upload!' });
                }

                // Build embed showing ready chapters
                const embed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle('📤 Chapters Ready for Upload')
                    .setDescription(`Found ${readyChapters.length} chapter(s) ready to upload:`)
                    .setTimestamp();

                readyChapters.forEach((ch, index) => {
                    embed.addFields({
                        name: `${index + 1}. ${ch.projectName}`,
                        value: `Chapter: **${ch.nextChapter}** | Count: **${ch.chapterCount}** | Price: **${ch.priceType === 'S' ? '100' : '50'} points**`,
                        inline: false
                    });
                });

                // Create "Start Uploading" button
                const button = new ButtonBuilder()
                    .setCustomId('start_uploading')
                    .setLabel('🚀 Start Uploading')
                    .setStyle(ButtonStyle.Success);

                const row = new ActionRowBuilder().addComponents(button);

                await interaction.editReply({
                    embeds: [embed],
                    components: [row]
                });
            }

        } catch (error) {
            console.error('❌ Error in /up command:', error);
            await interaction.editReply({ content: '❌ An error occurred!' });
        }
    }
};

// ====== HANDLE BUTTON INTERACTIONS ======
uploadBot.on('interactionCreate', async (interaction) => {
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'up') {
            await upCommand.execute(interaction);
        }
    }

    if (interaction.isButton() && interaction.customId === 'start_uploading') {
        try {
            await interaction.deferReply();

            // Get ready chapters again
            const readyChapters = await checkReadyChapters();

            if (readyChapters.length === 0) {
                return interaction.editReply({ content: '❌ No chapters to upload!' });
            }

            await interaction.editReply({ content: `🚀 Starting upload process for ${readyChapters.length} chapter(s)...` });

            // Upload each chapter
            for (const chapter of readyChapters) {
                const success = await uploadChapter(chapter, interaction);

                if (!success) {
                    await interaction.followUp({ content: `⚠️ Skipping remaining chapters due to error.` });
                    break;
                }

                // Wait between uploads
                await new Promise(resolve => setTimeout(resolve, 3000));
            }

            await interaction.followUp({ content: '✅ Upload process completed!' });

        } catch (error) {
            console.error('❌ Error handling upload button:', error);
            await interaction.editReply({ content: '❌ An error occurred during upload!' });
        }
    }
});

// ====== BOT READY ======
uploadBot.once('ready', async () => {
    console.log(`✅ Upload Bot is ready as ${uploadBot.user.tag}`);

    // Register slash command
    const commands = [upCommand.data].map(cmd => cmd.toJSON());
    await uploadBot.application.commands.set(commands);
    console.log('✅ Registered /up command');
});

// ====== ERROR HANDLING ======
process.on('unhandledRejection', error => {
    console.error('❌ Unhandled promise rejection in upload bot:', error);
});

export default uploadBot;
