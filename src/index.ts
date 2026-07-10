import { Client, IntentsBitField, Events, REST, Routes, ApplicationCommand } from 'discord.js';
import { connectDB, unrestricts, unrestrict, clean, migrateWatchingLast } from './database.js';
import { handleSlashCommand, commands, unrestrictStates, detachStates } from './commands/gw.js';
import { startWatcher } from './watcher.js';
import { startListener } from './listener.js';
import { serve, unserve } from './database.js';
import { log } from './logger.js';
import { DISCORD_TOKEN, CLIENT_ID } from './config.js';
import { gatekeepEmbed } from './embeds.js';

// Slash commands and buttons arrive via InteractionCreate, which needs no
// privileged intents; Guilds covers the guild/channel cache and join/leave events
const intents = [IntentsBitField.Flags.Guilds];

const client = new Client({ intents });

client.on(Events.ClientReady, async () => {
  await connectDB();
  await migrateWatchingLast();
  log('Bot is ready');

  // Register slash commands
  const rest = new REST().setToken(DISCORD_TOKEN);
  const currentCmdNames = commands.map(c => c.name);
  const toDelete = ['watch', 'watching', 'unwatch'];

  try {
    log('Started refreshing application (/) commands.');
    const existing = (await rest.get(Routes.applicationCommands(CLIENT_ID)) as ApplicationCommand[]) || [];
    for (const cmd of existing) {
      if (!currentCmdNames.includes(cmd.name) || toDelete.includes(cmd.name)) {
        await rest.delete(Routes.applicationCommand(CLIENT_ID, cmd.id));
        log(`Deleted command: ${cmd.name}`);
      }
    }
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands.map(c => c.toJSON()) });
    log('Successfully registered slash commands.');
  } catch (error) {
    log(`Error registering slash commands: ${error}`);
  }

  startWatcher(client);
  startListener(client);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isButton()) {
    const { customId } = interaction;
    const baseKey = customId.replace(/:(yes|no)$/, '');
    const isConfirm = customId.endsWith(':yes');

    const unrestrictState = unrestrictStates.get(baseKey);
    if (unrestrictState) {
      if (interaction.user.id !== unrestrictState.user_id) {
        await interaction.deferUpdate();
        return;
      }
      if (isConfirm) {
        await unrestrict(unrestrictState.guildId, unrestrictState.address);
      }
      const embed = gatekeepEmbed(
        isConfirm ? 'Channel has been unrestricted' : 'Cancelled'
      );
      await interaction.update({ embeds: [embed], components: [] });
      unrestrictStates.delete(baseKey);
      return;
    }

    const detachState = detachStates.get(baseKey);
    if (detachState) {
      if (interaction.user.id !== detachState.user_id) {
        await interaction.deferUpdate();
        return;
      }
      if (isConfirm) {
        await clean(detachState.method, detachState.address);
      }
      const embed = gatekeepEmbed(isConfirm ? 'Address has been detached' : 'Cancelled');
      await interaction.update({ embeds: [embed], components: [] });
      detachStates.delete(baseKey);
      return;
    }
  }

  if (!interaction.isChatInputCommand()) return;

  const checkFn = async (gId: string, channelId: string): Promise<boolean> => {
    return unrestricts(gId, channelId);
  };
  await handleSlashCommand(interaction, checkFn);
});

client.on(Events.GuildCreate, async (guild) => {
  await serve(guild.name, guild.id);
  log(`Now serving ${guild.id}`);
});

client.on(Events.GuildDelete, async (guild) => {
  await unserve(guild.name, guild.id);
  log(`No longer serving ${guild.id}`);
});

client.login(DISCORD_TOKEN);
