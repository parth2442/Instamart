import { Client, GatewayIntentBits, REST, Routes, Events } from 'discord.js';
import { config } from './config.js';
import { initDB } from './database.js';
import { handlePrefix } from './prefix.js';
import { registerAll } from './commands/index.js';
import { registerSlashHandlers, getSlashHandler, buildSlashCommands } from './commands/slash.js';
import * as res from './response.js';
import {
  handleCategorySelect,
  handleSlotButton,
  handleBuyButton,
  handleWishlistButton,
  handleViewCart,
  handleCartCheckout,
  handleBackToShop,
  handleRefreshShop,
  handleCartClear,
} from './handlers/vending.js';
import { handleCheckoutModal } from './handlers/modals.js';
import { handleHelpCategory, handleHelpBack } from './help.js';
import { handleTcAccept } from './rules.js';

// Init DB
initDB();
console.log('Database initialized');

// Start web panel
import { startWebServer } from './web/server.js';
const WEB_PORT = parseInt(process.env.WEB_PORT || '3000');
startWebServer(WEB_PORT);

// Register prefix handlers
registerAll();
console.log('Prefix commands loaded');

// Register slash handlers
registerSlashHandlers();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
  ],
});

client.once(Events.ClientReady, async () => {
  console.log(`Logged in as ${client.user?.tag}!`);

  // Register slash commands with Discord API
  const rest = new REST({ version: '10' }).setToken(config.token);
  try {
    const cmds = buildSlashCommands();
    await rest.put(
      Routes.applicationGuildCommands(config.clientId, config.guildId),
      { body: cmds }
    );
    console.log(`Registered ${cmds.length} slash commands`);
  } catch (err) {
    console.error('Failed to register slash commands:', err);
  }
});

// ── Message (Prefix) Handler ──
client.on(Events.MessageCreate, (msg) => {
  handlePrefix(msg);
});

// ── Interaction Handler ──
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const handler = getSlashHandler(interaction.commandName);
      if (handler) await handler(interaction);
      return;
    }

    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === 'select_category') {
        await handleCategorySelect(interaction);
        return;
      }
      if (interaction.customId === 'help_category') {
        await handleHelpCategory(interaction);
        return;
      }
    }

    if (interaction.isButton()) {
      const cid = interaction.customId;

      if (cid === 'accept_tc') {
        await handleTcAccept(interaction);
        return;
      }

      if (cid.startsWith('slot_')) {
        const slotId = cid.slice(5);
        await handleSlotButton(interaction, slotId);
        return;
      }

      if (cid.startsWith('buy_')) {
        const productId = parseInt(cid.slice(4));
        await handleBuyButton(interaction, productId);
        return;
      }

      if (cid.startsWith('wish_')) {
        const productId = parseInt(cid.slice(5));
        await handleWishlistButton(interaction, productId);
        return;
      }

      if (cid === 'help_back') {
        await handleHelpBack(interaction);
        return;
      }

      switch (cid) {
        case 'view_cart':
          await handleViewCart(interaction);
          return;
        case 'cart_checkout':
          await handleCartCheckout(interaction);
          return;
        case 'back_to_shop':
          await handleBackToShop(interaction);
          return;
        case 'refresh_shop':
          await handleRefreshShop(interaction);
          return;
        case 'cart_clear':
          await handleCartClear(interaction);
          return;
      }
    }

    // Modal submit
    if (interaction.isModalSubmit() && interaction.customId === 'checkout_modal') {
      await handleCheckoutModal(interaction);
      return;
    }

  } catch (err) {
    console.error('Interaction error:', err);
    const reply = interaction.isRepliable() && !interaction.replied;
    if (reply) {
      try {
        await interaction.reply({ embeds: [res.error('An error occurred!')], ephemeral: true });
      } catch {}
    }
  }
});

client.login(config.token).then(() => {
  console.log('Bot is now running. Press Ctrl+C to exit.');
}).catch(err => {
  console.error('Failed to login:', err);
  process.exit(1);
});
