import { ChatInputCommandInteraction, SlashCommandBuilder, PermissionFlagsBits, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, EmbedBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { EMOJI, COLORS, config, UPI_PRESETS } from '../config.js';
import { formatCurrency, generateOrderId } from '../utils.js';
import { helpEmbed, balanceEmbed, cartEmbed, historyEmbed, wishlistEmbed, referralEmbed, deliveryEmbed, orderEmbed } from '../embeds.js';
import { vendingMachineRows } from '../handlers/vending.js';
import * as db from '../database.js';
import * as res from '../response.js';
import { sendHelpSlash } from '../help.js';
import { postVerifyButton } from '../handlers/verify.js';
import { bridgeToPrefix, getHybridSlashDefs } from './hybrid.js';

type SlashHandler = (interaction: ChatInputCommandInteraction) => void | Promise<void>;

const handlers = new Map<string, SlashHandler>();

export function registerSlash(name: string, handler: SlashHandler) {
  handlers.set(name, handler);
}

export function getSlashHandler(name: string): SlashHandler | undefined {
  return handlers.get(name);
}

function botAvatar(interaction: ChatInputCommandInteraction): string | undefined {
  return interaction.client?.user?.displayAvatarURL({ forceStatic: false, size: 256 });
}

function isAdmin(interaction: ChatInputCommandInteraction): boolean {
  if (config.botOwnerIds.includes(interaction.user.id)) return true;
  if (interaction.member && 'permissions' in interaction.member) {
    if (interaction.member.permissions as any & { has: (p: bigint) => boolean }) {
      try {
        if ((interaction.member.permissions as any).has(PermissionFlagsBits.Administrator)) return true;
      } catch {}
    }
    if (config.adminRoleId && 'roles' in interaction.member) {
      const roles = (interaction.member as any).roles;
      if (roles && typeof roles.cache?.has === 'function' && roles.cache.has(config.adminRoleId)) return true;
    }
  }
  return false;
}

export function buildSlashCommands() {
  return [
    ...getHybridSlashDefs(),
    new SlashCommandBuilder().setName('upi')
      .setDescription('\u{1F4B0} Manage your UPI ID')
      .addStringOption(opt => opt.setName('action').setDescription('Action').setRequired(true)
        .addChoices(
          { name: 'show', value: 'show' },
          { name: 'set', value: 'set' },
          { name: 'presets', value: 'presets' },
        ))
      .addStringOption(opt => opt.setName('value').setDescription('UPI ID or preset name').setRequired(false)),
    new SlashCommandBuilder().setName('upiqr')
      .setDescription('\u{1F4B0} Generate UPI payment QR/link')
      .addStringOption(opt => opt.setName('target').setDescription('UPI ID or preset name').setRequired(true))
      .addNumberOption(opt => opt.setName('amount').setDescription('Amount in INR').setRequired(false))
      .addStringOption(opt => opt.setName('note').setDescription('Payment note').setRequired(false)),
    new SlashCommandBuilder().setName('ltc')
      .setDescription('\u{1FA99} LTC wallet commands')
      .addStringOption(opt => opt.setName('action').setDescription('Action').setRequired(true)
        .addChoices(
          { name: 'show', value: 'show' },
          { name: 'set', value: 'set' },
          { name: 'balance', value: 'balance' },
          { name: 'convert', value: 'convert' },
          { name: 'info', value: 'info' },
        ))
      .addStringOption(opt => opt.setName('value').setDescription('Address or amount').setRequired(false))
      .addStringOption(opt => opt.setName('currency').setDescription('Currency for convert (INR/USD)').setRequired(false)),
    new SlashCommandBuilder().setName('balance').setDescription('\u{1F4B0} Check your wallet balance'),
    new SlashCommandBuilder().setName('cart').setDescription('\u{1F6D2} View your shopping cart'),
    new SlashCommandBuilder().setName('history').setDescription('\u{1F4CB} View your purchase history'),
    new SlashCommandBuilder().setName('wishlist').setDescription('\u{1F4CB} View your wishlist'),
    new SlashCommandBuilder().setName('give')
      .setDescription('\u{1F4B0} Give coins to another user')
      .addNumberOption(opt => opt.setName('amount').setDescription('Amount of coins').setRequired(true))
      .addUserOption(opt => opt.setName('user').setDescription('User to give to').setRequired(true)),
    new SlashCommandBuilder().setName('referral').setDescription('\u{1F517} View your referral code'),
    new SlashCommandBuilder().setName('help').setDescription('Show available commands'),
    new SlashCommandBuilder().setName('kick')
      .setDescription('Kick a member')
      .addUserOption(opt => opt.setName('user').setDescription('User to kick').setRequired(true))
      .addStringOption(opt => opt.setName('reason').setDescription('Reason').setRequired(false))
      .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
    new SlashCommandBuilder().setName('ban')
      .setDescription('Ban a member')
      .addUserOption(opt => opt.setName('user').setDescription('User to ban').setRequired(true))
      .addStringOption(opt => opt.setName('reason').setDescription('Reason').setRequired(false))
      .addIntegerOption(opt => opt.setName('delete_days').setDescription('Delete messages from last X days').setRequired(false))
      .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
    new SlashCommandBuilder().setName('mute')
      .setDescription('Timeout/mute a member')
      .addUserOption(opt => opt.setName('user').setDescription('User to mute').setRequired(true))
      .addIntegerOption(opt => opt.setName('duration').setDescription('Duration in minutes').setRequired(true))
      .addStringOption(opt => opt.setName('reason').setDescription('Reason').setRequired(false))
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    new SlashCommandBuilder().setName('unmute')
      .setDescription('Remove timeout from a member')
      .addUserOption(opt => opt.setName('user').setDescription('User to unmute').setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    new SlashCommandBuilder().setName('purge')
      .setDescription('Bulk delete messages')
      .addIntegerOption(opt => opt.setName('amount').setDescription('Number of messages (1-100)').setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    new SlashCommandBuilder().setName('setupverify')
      .setDescription('\u{1F512} Auto-setup verification system')
      .addBooleanOption(opt => opt.setName('auto').setDescription('Auto-create role, channel & lock everything').setRequired(false))
      .addChannelOption(opt => opt.setName('channel').setDescription('Verify channel (manual mode)').setRequired(false))
      .addRoleOption(opt => opt.setName('role').setDescription('Verified role (manual mode)').setRequired(false))
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('slowmode')
      .setDescription('Set slowmode')
      .addIntegerOption(opt => opt.setName('seconds').setDescription('Seconds (0 to disable)').setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    new SlashCommandBuilder().setName('announce')
      .setDescription('\u{1F4E2} Send an announcement')
      .addStringOption(opt => opt.setName('title').setDescription('Title').setRequired(true))
      .addStringOption(opt => opt.setName('message').setDescription('Message').setRequired(true))
      .addChannelOption(opt => opt.setName('channel').setDescription('Channel').setRequired(false))
      .addBooleanOption(opt => opt.setName('ping_everyone').setDescription('Ping @everyone?').setRequired(false))
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('coupon')
      .setDescription('\u{1F3F7}\u{FE0F} Manage coupons')
      .addSubcommand(sub => sub.setName('create').setDescription('Create a coupon code')
        .addStringOption(opt => opt.setName('code').setDescription('Coupon code').setRequired(true))
        .addNumberOption(opt => opt.setName('discount').setDescription('Discount percentage (e.g. 50 for 50%)').setRequired(true))
        .addNumberOption(opt => opt.setName('min_purchase').setDescription('Minimum purchase amount').setRequired(false))
        .addNumberOption(opt => opt.setName('max_uses').setDescription('Max uses (0 = unlimited)').setRequired(false)))
      .addSubcommand(sub => sub.setName('list').setDescription('List all coupons'))
      .addSubcommand(sub => sub.setName('delete').setDescription('Delete a coupon')
        .addStringOption(opt => opt.setName('code').setDescription('Coupon code to delete').setRequired(true)))
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  ].map(cmd => cmd.toJSON());
}

export function buildGlobalCommands() {
  return [
    new SlashCommandBuilder().setName('calc')
      .setDescription('\u{1F522} Evaluate a math expression')
      .addStringOption(opt => opt.setName('expression').setDescription('e.g. 2+2, sqrt(144), 5 * (3+2)').setRequired(true))
      .setDMPermission(true),
  ].map(cmd => cmd.toJSON());
}

export function registerSlashHandlers() {
  registerSlash('balance', async (interaction) => {
    await interaction.deferReply();
    await db.ensureUser(interaction.user.id);
    const bal = await db.getUserBalance(interaction.user.id);
    const spent = await db.getUserTotalSpent(interaction.user.id);
    await interaction.editReply({ flags: MessageFlags.IsComponentsV2, embeds: [], components: [balanceEmbed(interaction.user.id, bal, spent, botAvatar(interaction))] });
  });

  registerSlash('cart', async (interaction) => {
    await interaction.deferReply();
    await db.ensureUser(interaction.user.id);
    const items = await db.getCart(interaction.user.id);
    const total = await db.getCartTotal(interaction.user.id);
    await interaction.editReply({ flags: MessageFlags.IsComponentsV2, embeds: [], components: [cartEmbed(items, total, botAvatar(interaction))] });
  });

  registerSlash('history', async (interaction) => {
    await interaction.deferReply();
    await db.ensureUser(interaction.user.id);
    const orders = await db.getUserOrders(interaction.user.id);
    await interaction.editReply({ flags: MessageFlags.IsComponentsV2, embeds: [], components: [historyEmbed(orders, botAvatar(interaction))] });
  });

  registerSlash('wishlist', async (interaction) => {
    await interaction.deferReply();
    await db.ensureUser(interaction.user.id);
    const items = await db.getWishlist(interaction.user.id);
    await interaction.editReply({ flags: MessageFlags.IsComponentsV2, embeds: [], components: [wishlistEmbed(items, botAvatar(interaction))] });
  });

  registerSlash('give', async (interaction) => {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const amount = interaction.options.getNumber('amount', true);
    const target = interaction.options.getUser('user', true);
    if (target.id === interaction.user.id) {
      await interaction.editReply({ flags: MessageFlags.IsComponentsV2, embeds: [], components: [res.error("You can't give coins to yourself!")] });
      return;
    }
    if (amount <= 0) {
      await interaction.editReply({ flags: MessageFlags.IsComponentsV2, embeds: [], components: [res.error('Invalid amount!')] });
      return;
    }
    await db.ensureUser(interaction.user.id);
    await db.ensureUser(target.id);
    const ok = await db.deductBalance(interaction.user.id, amount);
    if (!ok) {
      const bal = await db.getUserBalance(interaction.user.id);
      await interaction.editReply({ flags: MessageFlags.IsComponentsV2, embeds: [], components: [res.error(`Insufficient balance! You have ${formatCurrency(bal)}`)] });
      return;
    }
    await db.updateBalance(target.id, amount);
    await interaction.editReply({ flags: MessageFlags.IsComponentsV2, embeds: [], components: [res.success(`${formatCurrency(amount)} sent to ${target}!`)] });
  });

  registerSlash('referral', async (interaction) => {
    await interaction.deferReply();
    await db.ensureUser(interaction.user.id);
    const code = await db.getReferralCode(interaction.user.id);
    const count = await db.getReferralCount(interaction.user.id);
    await interaction.editReply({ flags: MessageFlags.IsComponentsV2, embeds: [], components: [referralEmbed(code ?? '', count, botAvatar(interaction))] });
  });

  registerSlash('upi', async (interaction) => {
    await interaction.deferReply();
    const action = interaction.options.getString('action', true);
    const value = interaction.options.getString('value');

    if (action === 'show') {
      const saved = await db.getUPI(interaction.user.id);
      if (!saved) {
        await interaction.editReply({ embeds: [], components: [res.warning('No UPI saved. Use `/upi set`')] });
        return;
      }
      const embed = new EmbedBuilder()
        .setColor(COLORS.gold).setTitle(`${EMOJI.coin} Your UPI ID`)
        .setDescription(`\`${saved}\``).setFooter({ text: 'Crafted by Parth.cd' }).setTimestamp();
      await interaction.editReply({ embeds: [embed] });
    } else if (action === 'set') {
      if (!value || !value.includes('@')) {
        await interaction.editReply({ embeds: [], components: [res.error('Invalid UPI ID!')] });
        return;
      }
      await db.setUPI(interaction.user.id, value);
      await interaction.editReply({ embeds: [], components: [res.success(`UPI saved: \`${value}\``)] });
    } else if (action === 'presets') {
      const lines = Object.entries(UPI_PRESETS).map(([k, v]) => `\`${k}\` → \`${v}\``);
      const embed = new EmbedBuilder()
        .setColor(COLORS.gold).setTitle(`${EMOJI.star} UPI Presets`)
        .setDescription(lines.join('\n')).setFooter({ text: 'Crafted by Parth.cd' });
      await interaction.editReply({ embeds: [embed] });
    }
  });

  registerSlash('upiqr', async (interaction) => {
    await interaction.deferReply();
    const target = interaction.options.getString('target', true).toLowerCase();
    const amount = interaction.options.getNumber('amount');
    const note = interaction.options.getString('note');

    const upiId = UPI_PRESETS[target] || target;
    let params = `pa=${upiId}&pn=Mega Bazar&cu=INR`;
    if (amount) params += `&am=${amount}`;
    if (note) params += `&tn=${encodeURIComponent(note)}`;
    const upiLink = `upi://pay?${params}`;

    const embed = new EmbedBuilder()
      .setColor(COLORS.gold).setTitle(`${EMOJI.coin} UPI Payment`)
      .setDescription([
        `**Payee:** Mega Bazar`,
        `**UPI ID:** \`${upiId}\``,
        amount ? `**Amount:** ₹${amount}` : '',
        note ? `**Note:** ${note}` : '',
        '',
        `[Pay via UPI](${upiLink})`,
      ].filter(Boolean).join('\n'))
      .setFooter({ text: 'Crafted by Parth.cd' });

    await interaction.editReply({ embeds: [embed] });
  });

  registerSlash('ltc', async (interaction) => {
    await interaction.deferReply();
    const action = interaction.options.getString('action', true);
    const value = interaction.options.getString('value');
    const currency = interaction.options.getString('currency') || 'INR';

    if (action === 'show' || (action === 'show' && !value)) {
      const saved = await db.getLTC(interaction.user.id);
      if (!saved) {
        await interaction.editReply({ embeds: [], components: [res.warning('No LTC address saved. Use `/ltc set`')] });
        return;
      }
      const bal = await db.getLTCBalance(saved);
      const price = await db.getLTCPrice();
      const embed = new EmbedBuilder()
        .setColor(COLORS.gold).setTitle(`${EMOJI.coin} LTC Wallet`)
        .setDescription([
          `**Address:** \`${saved}\``,
          `**Balance:** ${bal.toFixed(4)} LTC`,
          price.inr ? `**INR:** ₹${(bal * price.inr).toFixed(2)}` : '',
          price.usd ? `**USD:** $${(bal * price.usd).toFixed(2)}` : '',
        ].filter(Boolean).join('\n'))
        .setFooter({ text: 'Crafted by Parth.cd' }).setTimestamp();
      await interaction.editReply({ embeds: [embed] });
    } else if (action === 'set') {
      if (!value) {
        await interaction.editReply({ embeds: [], components: [res.error('Usage: `/ltc set <address>`')] });
        return;
      }
      await db.setLTC(interaction.user.id, value);
      await interaction.editReply({ embeds: [], components: [res.success('LTC address saved!')] });
    } else if (action === 'balance') {
      const address = value || await db.getLTC(interaction.user.id);
      if (!address) {
        await interaction.editReply({ embeds: [], components: [res.error('No address. Provide one or save with `/ltc set`')] });
        return;
      }
      const bal = await db.getLTCBalance(address);
      const price = await db.getLTCPrice();
      const embed = new EmbedBuilder()
        .setColor(COLORS.gold).setTitle(`${EMOJI.coin} LTC Balance`)
        .setDescription([
          `**Address:** \`${address}\``,
          `**Balance:** ${bal.toFixed(4)} LTC`,
          price.inr ? `**≈ ₹**${(bal * price.inr).toFixed(2)}` : '',
          price.usd ? `**≈ $**${(bal * price.usd).toFixed(2)}` : '',
        ].filter(Boolean).join('\n'))
        .setFooter({ text: 'Crafted by Parth.cd' });
      await interaction.editReply({ embeds: [embed] });
    } else if (action === 'convert') {
      const amount = parseFloat(value || '0');
      if (isNaN(amount) || amount <= 0) {
        await interaction.editReply({ embeds: [], components: [res.error('Usage: `/ltc convert <amount>`')] });
        return;
      }
      const price = await db.getLTCPrice();
      const rate = currency === 'USD' ? price.usd : price.inr;
      if (!rate) {
        await interaction.editReply({ embeds: [], components: [res.error('Could not fetch LTC price')] });
        return;
      }
      const ltcAmount = amount / rate;
      const symbol = currency === 'USD' ? '$' : '₹';
      const embed = new EmbedBuilder()
        .setColor(COLORS.gold).setTitle(`${EMOJI.coin} LTC Convert`)
        .setDescription(`${symbol}${amount.toFixed(2)} ${currency} = **${ltcAmount.toFixed(6)} LTC**`)
        .setFooter({ text: `Rate: 1 LTC = ${symbol}${rate.toFixed(2)} ${currency}` });
      await interaction.editReply({ embeds: [embed] });
    } else if (action === 'info') {
      const address = value || await db.getLTC(interaction.user.id);
      if (!address) {
        await interaction.editReply({ embeds: [], components: [res.error('No address. Provide one or save with `/ltc set`')] });
        return;
      }
      const [bal, price, txs] = await Promise.all([
        db.getLTCBalance(address),
        db.getLTCPrice(),
        db.getLTCTxs(address, 3),
      ]);
      const embed = new EmbedBuilder()
        .setColor(COLORS.gold).setTitle(`${EMOJI.coin} LTC Address Info`)
        .setDescription([
          `**Address:** \`${address}\``,
          `**Balance:** ${bal.toFixed(4)} LTC`,
          price.inr ? `**≈ ₹**${(bal * price.inr).toFixed(2)}` : '',
          price.usd ? `**≈ $**${(bal * price.usd).toFixed(2)}` : '',
          '',
          '**Recent Transactions:**',
          ...(txs.length > 0 ? txs.map((tx: any) => `• \`${(tx.tx_hash || '').slice(0, 12)}...\` ${(tx.value || 0) / 1e8} LTC`) : ['No recent transactions']),
        ].filter(Boolean).join('\n'))
        .setFooter({ text: 'BlockCypher' });
      await interaction.editReply({ embeds: [embed] });
    }
  });

  registerSlash('help', async (interaction) => {
    await sendHelpSlash(interaction);
  });

  registerSlash('calc', async (interaction) => {
    await interaction.deferReply();
    const expression = interaction.options.getString('expression', true);
    try {
      const { evaluate } = await import('mathjs');
      const result = evaluate(expression);
      const formatted = typeof result === 'number'
        ? (Number.isInteger(result) ? result.toString() : result.toFixed(4))
        : String(result);
      await interaction.editReply({ flags: MessageFlags.IsComponentsV2, embeds: [], components: [
        new ContainerBuilder()
          .setAccentColor(0x000000)
          .addTextDisplayComponents(new TextDisplayBuilder().setContent('### \u{1F522} Calculator'))
          .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(`\`\`\`\n${expression}\n\`\`\``))
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**= ${formatted}**`))
          .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
          .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Crafted by Parth.cd')),
      ] });
    } catch {
      await interaction.editReply({ flags: MessageFlags.IsComponentsV2, embeds: [], components: [res.error('Invalid expression!')] });
    }
  });

  const noPerm = async (interaction: ChatInputCommandInteraction) => {
    await interaction.reply({ flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral, components: [res.error('No permission!')] });
  };

  registerSlash('kick', async (interaction) => {
    if (!isAdmin(interaction)) return noPerm(interaction);
    await interaction.deferReply();
    const target = interaction.options.getMember('user');
    const reason = interaction.options.getString('reason') || 'No reason';
    if (!target || !('kickable' in target)) {
      await interaction.editReply({ flags: MessageFlags.IsComponentsV2, embeds: [], components: [res.error('Invalid user!')] });
      return;
    }
    await (target as any).kick(reason);
    await interaction.editReply({ flags: MessageFlags.IsComponentsV2, embeds: [], components: [res.success(`Kicked ${target.user.tag}: ${reason}`)] });
  });

  registerSlash('ban', async (interaction) => {
    if (!isAdmin(interaction)) return noPerm(interaction);
    await interaction.deferReply();
    const target = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason') || 'No reason';
    const deleteDays = interaction.options.getInteger('delete_days') ?? 0;
    await interaction.guild?.members.ban(target, { reason, deleteMessageDays: deleteDays });
    await interaction.editReply({ flags: MessageFlags.IsComponentsV2, embeds: [], components: [res.success(`Banned ${target.tag}: ${reason}`)] });
  });

  registerSlash('mute', async (interaction) => {
    if (!isAdmin(interaction)) return noPerm(interaction);
    await interaction.deferReply();
    const target = interaction.options.getMember('user');
    const duration = interaction.options.getInteger('duration', true);
    const reason = interaction.options.getString('reason') || 'No reason';
    if (!target || !('timeout' in target)) {
      await interaction.editReply({ flags: MessageFlags.IsComponentsV2, embeds: [], components: [res.error('Invalid user!')] });
      return;
    }
    await (target as any).timeout(duration * 60 * 1000, reason);
    await interaction.editReply({ flags: MessageFlags.IsComponentsV2, embeds: [], components: [res.success(`Muted ${target.user.tag} for ${duration} min: ${reason}`)] });
  });

  registerSlash('unmute', async (interaction) => {
    if (!isAdmin(interaction)) return noPerm(interaction);
    await interaction.deferReply();
    const target = interaction.options.getMember('user');
    if (!target || !('timeout' in target)) {
      await interaction.editReply({ flags: MessageFlags.IsComponentsV2, embeds: [], components: [res.error('Invalid user!')] });
      return;
    }
    await (target as any).timeout(null);
    await interaction.editReply({ flags: MessageFlags.IsComponentsV2, embeds: [], components: [res.success(`Unmuted ${target.user.tag}`)] });
  });

  registerSlash('purge', async (interaction) => {
    if (!isAdmin(interaction)) return noPerm(interaction);
    await interaction.deferReply();
    const amount = interaction.options.getInteger('amount', true);
    if (amount < 1 || amount > 100) {
      await interaction.editReply({ flags: MessageFlags.IsComponentsV2, embeds: [], components: [res.error('Amount must be 1-100!')] });
      return;
    }
    const msgs = await interaction.channel?.messages.fetch({ limit: Math.min(amount, 100) });
    if (msgs && interaction.channel && 'bulkDelete' in interaction.channel) {
      await (interaction.channel as any).bulkDelete(msgs, true);
      await interaction.editReply({ flags: MessageFlags.IsComponentsV2, embeds: [], components: [res.success(`Deleted ${msgs.size} messages`)] });
    }
  });

  registerSlash('slowmode', async (interaction) => {
    if (!isAdmin(interaction)) return noPerm(interaction);
    await interaction.deferReply();
    const secs = interaction.options.getInteger('seconds', true);
    if (secs < 0 || secs > 21600) {
      await interaction.editReply({ flags: MessageFlags.IsComponentsV2, embeds: [], components: [res.error('Must be 0-21600!')] });
      return;
    }
    if (interaction.channel && 'setRateLimitPerUser' in interaction.channel) {
      await (interaction.channel as any).setRateLimitPerUser(secs);
      await interaction.editReply({ flags: MessageFlags.IsComponentsV2, embeds: [], components: [res.success(`Slowmode set to ${secs}s`)] });
    }
  });

  registerSlash('announce', async (interaction) => {
    if (!isAdmin(interaction)) return noPerm(interaction);
    await interaction.deferReply();
    const title = interaction.options.getString('title', true);
    const message = interaction.options.getString('message', true);
    const channel = interaction.options.getChannel('channel') || interaction.channel;
    const pingEveryone = interaction.options.getBoolean('ping_everyone') || false;
    if (!channel || !('send' in channel)) {
      await interaction.editReply({ flags: MessageFlags.IsComponentsV2, embeds: [], components: [res.error('Invalid channel!')] });
      return;
    }
    const pingStr = pingEveryone ? '@everyone\n\n' : '';
    const announceEmbed = new EmbedBuilder()
      .setColor(COLORS.gold)
      .setTitle('\u{1F4E2} ' + title)
      .setDescription(pingStr + message)
      .setFooter({ text: `Announced by ${interaction.user.tag}` });
    await (channel as any).send({ embeds: [announceEmbed] });
    await interaction.editReply({ flags: MessageFlags.IsComponentsV2, embeds: [], components: [res.success('Announcement sent!')] });
  });

  registerSlash('setupverify', async (interaction) => {
    if (!isAdmin(interaction)) return noPerm(interaction);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const guild = interaction.guild;
    if (!guild) {
      await interaction.editReply({ flags: MessageFlags.IsComponentsV2, components: [res.error('Guild only!')] });
      return;
    }

    const auto = interaction.options.getBoolean('auto') ?? false;
    const manualCh = interaction.options.getChannel('channel');
    const manualRole = interaction.options.getRole('role');

    if (auto) {
      const botMember = await guild.members.fetchMe();
      if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles) || !botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
        await interaction.editReply({ flags: MessageFlags.IsComponentsV2, components: [res.error('I need Manage Roles & Manage Channels permissions!')] });
        return;
      }

      let role = guild.roles.cache.find(r => r.name === 'Verified');
      if (!role) {
        role = await guild.roles.create({ name: 'Verified', color: 0xD4AF37, reason: 'Auto verify setup' });
      }

      let verifyCh = guild.channels.cache.find(c => c.name === 'verify' && c.type === 0);
      if (!verifyCh) {
        verifyCh = await guild.channels.create({
          name: 'verify',
          type: 0,
          permissionOverwrites: [
            { id: guild.roles.everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory] },
            { id: role.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory] },
            { id: botMember.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages] },
          ],
          reason: 'Auto verify setup',
        });
        await verifyCh.setPosition(0);
      } else {
        await (verifyCh as any).permissionOverwrites.edit(guild.roles.everyone, { ViewChannel: true, ReadMessageHistory: true });
        await (verifyCh as any).permissionOverwrites.edit(role.id, { ViewChannel: true, ReadMessageHistory: true });
      }

      for (const ch of guild.channels.cache.values()) {
        if (ch.id === verifyCh.id) continue;
        try {
          (ch as any).permissionOverwrites?.edit(guild.roles.everyone, { ViewChannel: false });
          (ch as any).permissionOverwrites?.edit(role.id, { ViewChannel: true });
        } catch {}
      }

      await db.setVerifyChannel(verifyCh.id);
      await db.setVerifyRole(role.id);
      await postVerifyButton(verifyCh);

      await interaction.editReply({ flags: MessageFlags.IsComponentsV2, components: [res.success(`Auto verify done!\nChannel: ${verifyCh}\nRole: ${role}\nAll channels locked.`)] });
      return;
    }

    if (manualCh && manualRole) {
      await db.setVerifyChannel(manualCh.id);
      await db.setVerifyRole(manualRole.id);
      await postVerifyButton(manualCh);
      await interaction.editReply({ flags: MessageFlags.IsComponentsV2, components: [res.success(`Verify set!\nChannel: ${manualCh}\nRole: ${manualRole}\nButton posted.`)] });
      return;
    }

    await interaction.editReply({ flags: MessageFlags.IsComponentsV2, components: [res.info('Usage: `/setupverify auto:true` or `/setupverify channel:#ch role:@role`')] });
  });

  registerSlash('coupon', async (interaction) => {
    if (!isAdmin(interaction)) return noPerm(interaction);
    const sub = interaction.options.getSubcommand();

    if (sub === 'create') {
      await interaction.deferReply();
      const code = interaction.options.getString('code', true).toUpperCase();
      const discount = interaction.options.getNumber('discount', true);
      const minPurchase = interaction.options.getNumber('min_purchase') || 0;
      const maxUses = interaction.options.getNumber('max_uses') || 0;

      if (discount <= 0 || discount > 100) {
        await interaction.editReply({ flags: MessageFlags.IsComponentsV2, embeds: [], components: [res.error('Discount must be 1-100!')] });
        return;
      }

      const existing = await db.getCoupon(code);
      if (existing) {
        await interaction.editReply({ flags: MessageFlags.IsComponentsV2, embeds: [], components: [res.error('Coupon code already exists!')] });
        return;
      }

      await db.createCoupon(code, discount, minPurchase, maxUses);
      await interaction.editReply({ flags: MessageFlags.IsComponentsV2, embeds: [], components: [res.success(`Coupon \`${code}\` created (${discount}% off, min ₹${minPurchase}, max ${maxUses || 'unlimited'} uses)!`)] });
    } else if (sub === 'list') {
      await interaction.deferReply();
      const coupons = await db.getAllCoupons();
      if (coupons.length === 0) {
        await interaction.editReply({ flags: MessageFlags.IsComponentsV2, embeds: [], components: [res.warning('No coupons!')] });
        return;
      }
      const lines = coupons.map((c: any) =>
        `\`${c.code}\` — ${c.discount_percent}% off | min ₹${c.min_purchase} | used ${c.used_count}/${c.max_uses || '\u{221E}'} | ${c.is_active ? '\u{2705}' : '\u{274C}'}`
      );
      const embed = new EmbedBuilder()
        .setColor(COLORS.gold).setTitle('\u{1F3F7}\u{FE0F} Coupons')
        .setDescription(lines.join('\n')).setFooter({ text: 'Crafted by Parth.cd' });
      await interaction.editReply({ embeds: [embed] });
    } else if (sub === 'delete') {
      await interaction.deferReply();
      const code = interaction.options.getString('code', true).toUpperCase();
      await db.deleteCoupon(code);
      await interaction.editReply({ flags: MessageFlags.IsComponentsV2, embeds: [], components: [res.success(`Coupon \`${code}\` deleted!`)] });
    }
  });

  // Bridge slash-only commands to prefix (AFTER all registerSlash calls)
  bridgeToPrefix('calc');
  bridgeToPrefix('coupon');
}
