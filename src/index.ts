import { Client, GatewayIntentBits, REST, Routes, Events, MessageFlags, ActivityType } from 'discord.js';
import { config } from './config.js';
import { initDB, getSetting } from './database.js';
import { handlePrefix } from './prefix.js';
import { registerAll } from './commands/index.js';
import { registerSlashHandlers, getSlashHandler, buildSlashCommands, buildGlobalCommands } from './commands/slash.js';
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
import { handleCheckoutModal, handlePayBalance, handlePayUPI, handlePayLTC, handleCancelPayment } from './handlers/modals.js';
import { handleHelpCategory, handleHelpBack } from './help.js';
import { startWebServer, setBotClient } from './web/server.js';
import { initInviteTracking, handleGuildMemberAdd, handleInviteCreate, handleInviteDelete, setReferralClient } from './handlers/referral.js';
import { handleVerifyButton, setVerifyClient } from './handlers/verify.js';
import { setLogChannelId } from './handlers/logger.js';

// Init DB + Start web panel
try {
  await initDB();
  console.log('MongoDB initialized');
} catch (err) {
  console.error('Failed to connect to MongoDB:', err);
  process.exit(1);
}

const WEB_PORT = parseInt(process.env.WEB_PORT || '8080');

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
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.MessageContent,
  ],
  presence: { status: 'dnd', activities: [{ name: 'Mega Bazar', type: ActivityType.Playing }] },
});

client.once(Events.ClientReady, async () => {
  console.log(`Logged in as ${client.user?.tag}!`);
  client.user?.setPresence({ status: 'dnd', activities: [{ name: 'Mega Bazar', type: ActivityType.Playing }] });
  setBotClient(client);
  setReferralClient(client);
  setVerifyClient(client);
  startWebServer(WEB_PORT);

  // Register slash commands with Discord API
  const rest = new REST({ version: '10' }).setToken(config.token);
  try {
    const cmds = buildSlashCommands();
    await rest.put(
      Routes.applicationGuildCommands(config.clientId, config.guildId),
      { body: cmds }
    );
    console.log(`Registered ${cmds.length} guild slash commands`);
    // Register global commands (calc for DMs)
    const globalCmds = buildGlobalCommands();
    await rest.put(
      Routes.applicationCommands(config.clientId),
      { body: globalCmds }
    );
    console.log(`Registered ${globalCmds.length} global slash commands`);
  } catch (err) {
    console.error('Failed to register slash commands:', err);
  }

  // Init invite tracking
  initInviteTracking(client, config.guildId);
  console.log('Invite tracking initialized');

  // Load log channel
  const logCh = await getSetting('log_channel');
  if (logCh) {
    setLogChannelId(logCh);
    console.log('Log channel loaded');
  }
});

// ── Guild Member Join ──
client.on(Events.GuildMemberAdd, async (member) => {
  handleGuildMemberAdd(member);
  // Send verify DM
  try {
    const guildId = member.guild.id;
    const siteUrl = process.env.SITE_URL || 'https://megabazar.roundbot.online';
    const verifyUrl = `${siteUrl}/verify.html?uid=${member.id}&gid=${guildId}`;
    await member.send(`# \u{1F512} Welcome to **${member.guild.name}**!\n\nPlease verify you are human to access the server:\n${verifyUrl}\n\nOr use the verify button in #verify channel.`);
  } catch {}
});

// ── Invite Create / Delete ──
client.on(Events.InviteCreate, (invite) => {
  handleInviteCreate(invite);
});
client.on(Events.InviteDelete, (invite) => {
  handleInviteDelete(invite);
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

      if (cid.startsWith('slot_')) {
        const productId = parseInt(cid.slice(5));
        if (isNaN(productId)) return;
        await handleSlotButton(interaction, productId);
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
        case 'pay_balance':
          await handlePayBalance(interaction);
          return;
        case 'pay_upi':
          await handlePayUPI(interaction);
          return;
        case 'pay_ltc':
          await handlePayLTC(interaction);
          return;
        case 'cancel_payment':
          await handleCancelPayment(interaction);
          return;
        case 'verify_me':
          await handleVerifyButton(interaction);
          return;
      }
    }

    // Modal submit
    if (interaction.isModalSubmit()) {
      if (interaction.customId === 'checkout_modal') {
        await handleCheckoutModal(interaction);
        return;
      }
    }

  } catch (err) {
    console.error('Interaction error:', err);
    try {
      if (interaction.isRepliable()) {
        if (interaction.deferred) {
          await interaction.editReply({ flags: MessageFlags.IsComponentsV2, components: [res.error('An error occurred!')] });
        } else if (!interaction.replied) {
          await interaction.reply({ flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral, components: [res.error('An error occurred!')] });
        }
      }
    } catch {}
  }
});

const shutdown = async () => {
  console.log('\nShutting down...');
  client.destroy();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

client.login(config.token).then(() => {
  console.log('Bot is now running. Press Ctrl+C to exit.');
}).catch(err => {
  console.error('Failed to login:', err);
  process.exit(1);
});
