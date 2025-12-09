const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
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
            // جلب القيم من الأوامر
            const roleType = interaction.options.getString('role');
            const projectRole = interaction.options.getRole('for');
            const fromChapter = interaction.options.getInteger('from');
            const numberOfChapters = interaction.options.getInteger('number_of_chapters');

            // التحقق من أن الرول موجود
            if (!projectRole) {
                return interaction.reply({ 
                    content: '❌ الرول المحدد غير موجود!', 
                    ephemeral: true 
                });
            }

            // البحث عن الروم المخصص للرول
            const targetChannel = interaction.guild.channels.cache.find(
                ch => ch.name.toLowerCase() === projectRole.name.toLowerCase() && ch.isTextBased()
            );

            if (!targetChannel) {
                return interaction.reply({ 
                    content: `❌ لم أجد روم بإسم: ${projectRole.name}`, 
                    ephemeral: true 
                });
            }

            // إنشاء رسالة الطلب مع الزر
            const { ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder } = require('discord.js');

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle(`📢 ${roleType} مطلوب!`)
                .setDescription(`**المشروع:** ${projectRole.name}\n**المطلوب:** ${roleType}`)
                .addFields(
                    { name: '👤 طالب الطلب', value: `${interaction.user}`, inline: true }
                )
                .setTimestamp();

            // إضافة عدد الشابترات إذا كان موجود
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

            // إرسال الرسالة في الروم المخصص
            await targetChannel.send({
                embeds: [embed],
                components: [row]
            });

            // الرد على المستخدم
            await interaction.reply({
                content: `✅ تم إرسال الطلب بنجاح إلى ${targetChannel}!`,
                ephemeral: true
            });

        } catch (error) {
            console.error('Error in /request command:', error);
            await interaction.reply({
                content: '❌ حدث خطأ أثناء تنفيذ الأمر!',
                ephemeral: true
            });
        }
    }
};
