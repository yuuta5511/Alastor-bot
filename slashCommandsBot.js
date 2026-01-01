import { Client, GatewayIntentBits, Collection } from "discord.js";
import { registerCommands } from './registerCommands.js';
import weekliesCommand from './weekliesCommand.js';
import hiatusCommand from './hiatusCommand.js';
import { handleWeeklyModal } from './autoWeeklies.js';
import { handleInteractions } from './interactionHandlers.js';

// ====== DISCORD BOT for Slash Commands ======
const slashBot = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
    ],
});

slashBot.slashCommands = new Collection();

// ====== Import and Register Commands ======
import { requestCommand, assignCommand, updateMembersCommand } from './commands.js';

slashBot.slashCommands.set(requestCommand.data.name, requestCommand);
slashBot.slashCommands.set(assignCommand.data.name, assignCommand);
slashBot.slashCommands.set(weekliesCommand.data.name, weekliesCommand);
slashBot.slashCommands.set(hiatusCommand.data.name, hiatusCommand);
slashBot.slashCommands.set(updateMembersCommand.data.name, updateMembersCommand);

// ====== Handle Interactions ======
slashBot.on('interactionCreate', async (interaction) => {
    if (interaction.isChatInputCommand()) {
        const command = slashBot.slashCommands.get(interaction.commandName);
        if (!command) return;

        try {
            await command.execute(interaction);
        } catch (error) {
            console.error('Command execution error:', error);
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: '❌ An error occurred while executing the command!', ephemeral: true });
            } else {
                await interaction.reply({ content: '❌ An error occurred while executing the command!', ephemeral: true });
            }
        }
    }

    // Handle weekly modal submission
    if (interaction.isModalSubmit() && interaction.customId.startsWith('weekly_modal_')) {
        const sessionId = interaction.customId.replace('weekly_modal_', '');
        await handleWeeklyModal(interaction, sessionId);
    }

    // Handle other interactions (buttons, etc.)
    await handleInteractions(interaction, slashBot);
});

// ====== Bot Ready ======
slashBot.once('ready', async () => {
    console.log(`✅ Slash Commands Bot is ready as ${slashBot.user.tag}`);
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
