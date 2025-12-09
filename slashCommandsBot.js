import { Client, GatewayIntentBits, Collection, SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from "discord.js";
import { google } from "googleapis";
import { registerCommands } from './registerCommands.js';

// ====== DISCORD BOT للـ Slash Commands ======
const slashBot = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
    ],
});

slashBot.slashCommands = new Collection();

// ====== FUNCTION TO EXTRACT FIRST TWO WORDS ======
function getFirstTwoWords(text) {
    if (!text) return "";
    
    const words = text
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .replace(/[^\x00-\x7F]/g, '')
        .split(/\s+/)
        .filter(w => w.length > 0);
    
    return words.slice(0, 2).join(' ');
}

// ====== FUNCTION TO FIND MATCHING CHANNEL ======
function findMatchingChannel(roleName) {
    const firstTwoWords = getFirstTwoWords(roleName);
    if (!firstTwoWords) return null;
    
    const found = slashBot.channels.cache.find(c => {
        const channelFirstTwo = getFirstTwoWords(c.name.replace(/-/g, ' '));
        return channelFirstTwo === firstTwoWords && c.isTextBased();
    });
    
    return found;
}

// ====== تعريف الـ /request Command ======
const requestCommand = {
    data: new SlashCommandBuilder()
        .setName('request')
        .setDescription('Request a role for a project')
        .addStringOption(option =>
            option.setName('role')
                .setDescription('The role type you need')
                .setRequired(true)
                .addChoices(
                    { name: 'Translator (TL)', value: 'TL' },
                    { name: 'Editor (ED)', value: 'ED' },
                    { name: 'Proofreader (PR)', value: 'PR' }
                ))
        .addRoleOption(option =>
            option.setName('for')
                .setDescription('Select the project role')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('from')
                .setDescription('Starting chapter number')
                .setRequired(true)
                .setMinValue(1))
        .addIntegerOption(option =>
            option.setName('number_of_chapters')
                .setDescription('Number of chapters needed (optional)')
                .setRequired(false)
                .setMinValue(1)),

    async execute(interaction) {
        try {
            const roleType = interaction.options.getString('role');
            const projectRole = interaction.options.getRole('for');
            const fromChapter = interaction.options.getInteger('from');
            const numberOfChapters = interaction.options.getInteger('number_of_chapters');

            if (!projectRole) {
                return interaction.reply({ 
                    content: '❌ الرول المحدد غير موجود!', 
                    ephemeral: true 
                });
            }

            // البحث عن روم الإعلانات بالاسم الكامل
            const claimWorkChannel = interaction.guild.channels.cache.find(
                ch => ch.name === '🏹〢claim・work' && ch.isTextBased()
            );

            if (!claimWorkChannel) {
                return interaction.reply({ 
                    content: '❌ لم أجد روم 🏹〢claim・work!', 
                    ephemeral: true 
                });
            }

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle(`📢 ${roleType} مطلوب!`)
                .setDescription(`**المشروع:** ${projectRole.name}\n**المطلوب:** ${roleType}`)
                .addFields(
                    { name: '👤 طالب الطلب', value: `${interaction.user}`, inline: true }
                )
                .setTimestamp();

            if (numberOfChapters) {
                embed.addFields(
                    { name: '📚 عدد الشابترات', value: `${numberOfChapters}`, inline: true }
                );
            }

            const button = new ButtonBuilder()
                .setCustomId(`accept_request_${interaction.user.id}_${projectRole.id}_${fromChapter}_${roleType}`)
                .setLabel('قبول المهمة ✅')
                .setStyle(ButtonStyle.Success);

            const row = new ActionRowBuilder().addComponents(button);

            await claimWorkChannel.send({
                embeds: [embed],
                components: [row]
            });

            await interaction.reply({
                content: `✅ تم إرسال الطلب بنجاح إلى ${claimWorkChannel}!`,
                ephemeral: true
            });

        } catch (error) {
            console.error('Error in /request command:', error);
            const errorMessage = { content: '❌ حدث خطأ أثناء تنفيذ الأمر!', ephemeral: true };
            
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(errorMessage);
            } else {
                await interaction.reply(errorMessage);
            }
        }
    }
};

slashBot.slashCommands.set(requestCommand.data.name, requestCommand);

// ====== معالجة الـ Interactions ======
slashBot.on('interactionCreate', async (interaction) => {
    // معالجة Slash Commands
    if (interaction.isChatInputCommand()) {
        const command = slashBot.slashCommands.get(interaction.commandName);
        if (!command) return;

        try {
            await command.execute(interaction);
        } catch (error) {
            console.error('Command execution error:', error);
            const errorMessage = { content: '❌ حدث خطأ أثناء تنفيذ الأمر!', ephemeral: true };
            
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(errorMessage);
            } else {
                await interaction.reply(errorMessage);
            }
        }
    }

    // معالجة Buttons
    if (interaction.isButton() && interaction.customId.startsWith('accept_request_')) {
        try {
            const parts = interaction.customId.split('_');
            const requesterId = parts[2];
            const roleId = parts[3];
            const fromChapter = parts[4];
            const roleType = parts[5];

            const acceptingUser = interaction.user;
            const guild = interaction.guild;

            // إعطاء الرول
            const role = guild.roles.cache.get(roleId);
            if (!role) {
                return interaction.reply({ content: '❌ الرول غير موجود!', ephemeral: true });
            }

            const member = await guild.members.fetch(acceptingUser.id);
            await member.roles.add(role);

            // البحث عن روم الإيميلات بالاسم الكامل
            const emailsChannel = guild.channels.cache.find(
                ch => ch.name === '📝〢emails' && ch.isTextBased()
            );

            if (!emailsChannel) {
                return interaction.reply({ 
                    content: '❌ لم أجد روم 📝〢emails!', 
                    ephemeral: true 
                });
            }

            // جلب آخر رسالة من المستخدم
            const messages = await emailsChannel.messages.fetch({ limit: 100 });
            const userMessages = messages.filter(msg => msg.author.id === acceptingUser.id);
            
            if (userMessages.size === 0) {
                return interaction.reply({ 
                    content: '❌ لم أجد أي إيميل سابق لك في روم emails!', 
                    ephemeral: true 
                });
            }

            const lastUserMessage = userMessages.first();
            const userEmail = lastUserMessage.content.trim();

            // ====== Google API Setup ======
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
            const sheetName = process.env.SHEET_NAME || 'PROGRESS';

            // قراءة الشيت
            const response = await sheets.spreadsheets.values.get({
                spreadsheetId,
                range: `${sheetName}`,
            });

            const rows = response.data.values;
            if (!rows || rows.length === 0) {
                return interaction.reply({ content: '❌ الشيت فارغ!', ephemeral: true });
            }

            // البحث عن المشروع باستخدام أول كلمتين
            const roleFirstTwo = getFirstTwoWords(role.name);
            const projectRow = rows.find(row => {
                if (!row[0]) return false;
                const sheetFirstTwo = getFirstTwoWords(row[0]);
                return sheetFirstTwo === roleFirstTwo;
            });

            if (!projectRow) {
                return interaction.reply({ 
                    content: `❌ لم أجد المشروع "${role.name}" في الشيت!`, 
                    ephemeral: true 
                });
            }

            // جلب رابط Drive
            const driveLink = projectRow[37];
            console.log("🔍 DRIVE LINK EXTRACTED:", driveLink);
            if (!driveLink) {
                return interaction.reply({ 
                    content: '❌ لم أجد رابط Drive للمشروع!', 
                    ephemeral: true 
                });
            }

            // استخراج File ID
            const fileIdMatch = driveLink.match(/[-\w]{25,}/);
            if (!fileIdMatch) {
                return interaction.reply({ 
                    content: '❌ رابط Drive غير صالح!', 
                    ephemeral: true 
                });
            }

            const fileId = fileIdMatch[0];

            // إعطاء الصلاحية
            try {
                await drive.permissions.create({
                    fileId: fileId,
                    requestBody: {
                        role: 'writer',
                        type: 'user',
                        emailAddress: userEmail,
                    },
                    sendNotificationEmail: false,
                });
            } catch (driveError) {
                console.error('Drive permission error:', driveError);
                return interaction.reply({ 
                    content: '❌ حدث خطأ أثناء إعطاء صلاحية Drive!', 
                    ephemeral: true 
                });
            }

            // البحث عن روم المشروع باستخدام نفس طريقة أول كلمتين
            const targetChannel = findMatchingChannel(role.name);

            if (targetChannel) {
                await targetChannel.send(
                    `${acceptingUser} start from ch ${fromChapter}, I already gave you access ✅`
                );
            }

            // تعطيل الزر
            const disabledButton = new ButtonBuilder()
                .setCustomId('disabled_button')
                .setLabel('تم قبول المهمة ✅')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true);

            const newRow = new ActionRowBuilder().addComponents(disabledButton);

            const originalEmbed = interaction.message.embeds[0];
            const updatedEmbed = EmbedBuilder.from(originalEmbed)
                .setColor('#808080')
                .addFields({ name: '✅ تم القبول بواسطة', value: `${acceptingUser}`, inline: true });

            await interaction.message.edit({
                embeds: [updatedEmbed],
                components: [newRow]
            });

            await interaction.reply({
                content: `✅ تم! حصلت على رول ${role.name} وتم إعطائك صلاحية Drive`,
                ephemeral: true
            });

        } catch (error) {
            console.error('Error handling button:', error);
            await interaction.reply({
                content: '❌ حدث خطأ أثناء معالجة الطلب!',
                ephemeral: true
            });
        }
    }
});

// ====== Bot Ready ======
slashBot.once('ready', async () => {
    console.log(`✅ Slash Commands Bot is ready as ${slashBot.user.tag}`);
    
    // تسجيل الـ Commands تلقائياً
    await registerCommands();
});

// ====== Login ======
const token = process.env.BOT_TOKEN?.trim();
if (token) {
    slashBot.login(token)
        .then(() => console.log('✅ Slash Commands Bot logged in'))
        .catch(err => console.error('❌ Slash bot login failed:', err));
}

export default slashBot;
