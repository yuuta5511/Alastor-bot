const { google } = require('googleapis');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'interactionCreate',
    async execute(interaction, client) {
        // التعامل مع Slash Commands
        if (interaction.isChatInputCommand()) {
            const command = client.slashCommands?.get(interaction.commandName);
            if (!command) return;

            try {
                await command.execute(interaction);
            } catch (error) {
                console.error(error);
                const errorMessage = { content: '❌ حدث خطأ أثناء تنفيذ الأمر!', ephemeral: true };
                
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(errorMessage);
                } else {
                    await interaction.reply(errorMessage);
                }
            }
        }

        // التعامل مع Buttons
        if (interaction.isButton()) {
            // التحقق من أن الزر هو زر قبول المهمة
            if (interaction.customId.startsWith('accept_request_')) {
                try {
                    // استخراج البيانات من customId
                    const parts = interaction.customId.split('_');
                    const requesterId = parts[2]; // ID المستخدم اللي عمل الطلب
                    const roleId = parts[3]; // ID الرول
                    const fromChapter = parts[4]; // رقم الشابتر
                    const roleType = parts[5]; // نوع الرول (TL/ED/PR)

                    const acceptingUser = interaction.user;
                    const guild = interaction.guild;

                    // إعطاء الرول للمستخدم
                    const role = guild.roles.cache.get(roleId);
                    if (!role) {
                        return interaction.reply({ content: '❌ الرول غير موجود!', ephemeral: true });
                    }

                    const member = await guild.members.fetch(acceptingUser.id);
                    await member.roles.add(role);

                    // البحث عن روم emails
                    const emailsChannel = guild.channels.cache.find(
                        ch => ch.name.toLowerCase() === 'emails' && ch.isTextBased()
                    );

                    if (!emailsChannel) {
                        return interaction.reply({ 
                            content: '❌ لم أجد روم #emails!', 
                            ephemeral: true 
                        });
                    }

                    // جلب آخر رسالة من المستخدم في روم emails
                    const messages = await emailsChannel.messages.fetch({ limit: 100 });
                    const userMessages = messages.filter(msg => msg.author.id === acceptingUser.id);
                    
                    if (userMessages.size === 0) {
                        return interaction.reply({ 
                            content: '❌ لم أجد أي إيميل سابق لك في #emails!', 
                            ephemeral: true 
                        });
                    }

                    const lastUserMessage = userMessages.first();
                    const userEmail = lastUserMessage.content.trim();

                    // الاتصال بـ Google Sheets
                    const auth = new google.auth.GoogleAuth({
                        keyFile: 'credentials.json',
                        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
                    });

                    const sheets = google.sheets({ version: 'v4', auth });
                    const spreadsheetId = 'YOUR_SPREADSHEET_ID'; // ضع ID الشيت هنا

                    // قراءة البيانات
                    const response = await sheets.spreadsheets.values.get({
                        spreadsheetId,
                        range: 'Sheet1!A:J', // من عمود A إلى J
                    });

                    const rows = response.data.values;
                    if (!rows || rows.length === 0) {
                        return interaction.reply({ 
                            content: '❌ الشيت فارغ!', 
                            ephemeral: true 
                        });
                    }

                    // البحث عن اسم المشروع (من اسم الرول) في العمود الأول
                    const projectRow = rows.find(row => 
                        row[0] && row[0].toLowerCase() === role.name.toLowerCase()
                    );

                    if (!projectRow) {
                        return interaction.reply({ 
                            content: `❌ لم أجد المشروع "${role.name}" في الشيت!`, 
                            ephemeral: true 
                        });
                    }

                    // جلب رابط الـ Drive من العمود 10 (index 9)
                    const driveLink = projectRow[9];
                    if (!driveLink) {
                        return interaction.reply({ 
                            content: '❌ لم أجد رابط Drive للمشروع!', 
                            ephemeral: true 
                        });
                    }

                    // إعطاء صلاحية الوصول للـ Drive
                    // استخراج fileId من الرابط
                    const fileIdMatch = driveLink.match(/[-\w]{25,}/);
                    if (!fileIdMatch) {
                        return interaction.reply({ 
                            content: '❌ رابط الـ Drive غير صالح!', 
                            ephemeral: true 
                        });
                    }

                    const fileId = fileIdMatch[0];
                    const drive = google.drive({ version: 'v3', auth });

                    // إعطاء صلاحية للإيميل
                    try {
                        await drive.permissions.create({
                            fileId: fileId,
                            requestBody: {
                                role: 'writer',
                                type: 'user',
                                emailAddress: userEmail,
                            },
                        });
                    } catch (driveError) {
                        console.error('Drive permission error:', driveError);
                        return interaction.reply({ 
                            content: '❌ حدث خطأ أثناء إعطاء الصلاحية للـ Drive!', 
                            ephemeral: true 
                        });
                    }

                    // إرسال رسالة للمستخدم القابل
                    const targetChannel = guild.channels.cache.find(
                        ch => ch.name.toLowerCase() === role.name.toLowerCase() && ch.isTextBased()
                    );

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

                    // تحديث الرسالة الأصلية
                    const originalEmbed = interaction.message.embeds[0];
                    const updatedEmbed = EmbedBuilder.from(originalEmbed)
                        .setColor('#808080')
                        .addFields({ name: '✅ تم القبول بواسطة', value: `${acceptingUser}`, inline: true });

                    await interaction.message.edit({
                        embeds: [updatedEmbed],
                        components: [newRow]
                    });

                    // الرد على المستخدم
                    await interaction.reply({
                        content: `✅ تم! حصلت على رول ${role.name} وتم إعطائك صلاحية الوصول للـ Drive`,
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
        }
    }
};
