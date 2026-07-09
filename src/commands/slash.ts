import { ChatInputCommandInteraction, SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { EMOJI, COLORS, config } from '../config.js';
import { formatCurrency, generateOrderId } from '../utils.js';
import { helpEmbed, balanceEmbed, cartEmbed, historyEmbed, wishlistEmbed, referralEmbed, deliveryEmbed, orderEmbed } from '../embeds.js';
import { vendingMachineRows } from '../handlers/vending.js';
import * as db from '../database.js';

type SlashHandler = (interaction: ChatInputCommandInteraction) => void | Promise<void>;

const handlers = new Map<string, SlashHandler>();

export function registerSlash(name: string, handler: SlashHandler) {
  handlers.set(name, handler);
}

export function getSlashHandler(name: string): SlashHandler | undefined {
  return handlers.get(name);
}

function isAdmin(interaction: ChatInputCommandInteraction): boolean {
  if (interaction.user.id === config.botOwnerId) return true;
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
    new SlashCommandBuilder().setName('balance').setDescription('\u{1F4B0} Check your wallet balance'),
    new SlashCommandBuilder().setName('cart').setDescription('\u{1F6D2} View your shopping cart'),
    new SlashCommandBuilder().setName('history').setDescription('\u{1F4CB} View your purchase history'),
    new SlashCommandBuilder().setName('wishlist').setDescription('\u{1F4CB} View your wishlist'),
    new SlashCommandBuilder().setName('give')
      .setDescription('\u{1F4B0} Give coins to another user')
      .addNumberOption(opt => opt.setName('amount').setDescription('Amount of coins').setRequired(true))
      .addUserOption(opt => opt.setName('user').setDescription('User to give to').setRequired(true)),
    new SlashCommandBuilder().setName('referral').setDescription('\u{1F517} View your referral code'),
    new SlashCommandBuilder().setName('giveaway').setDescription('\u{1F389} Enter the giveaway'),
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
  ].map(cmd => cmd.toJSON());
}

export function registerSlashHandlers() {

  registerSlash('balance', async (interaction) => {
    await interaction.deferReply();
    db.ensureUser(interaction.user.id);
    const bal = db.getUserBalance(interaction.user.id);
    const spent = db.getUserTotalSpent(interaction.user.id);
    await interaction.editReply({ embeds: [balanceEmbed(interaction.user.id, bal, spent)] });
  });

  registerSlash('cart', async (interaction) => {
    await interaction.deferReply();
    db.ensureUser(interaction.user.id);
    const items = db.getCart(interaction.user.id);
    const total = db.getCartTotal(interaction.user.id);
    await interaction.editReply({ embeds: [cartEmbed(items, total)] });
  });

  registerSlash('history', async (interaction) => {
    await interaction.deferReply();
    db.ensureUser(interaction.user.id);
    const orders = db.getUserOrders(interaction.user.id);
    await interaction.editReply({ embeds: [historyEmbed(orders)] });
  });

  registerSlash('wishlist', async (interaction) => {
    await interaction.deferReply();
    db.ensureUser(interaction.user.id);
    const items = db.getWishlist(interaction.user.id);
    await interaction.editReply({ embeds: [wishlistEmbed(items)] });
  });

  registerSlash('give', async (interaction) => {
    await interaction.deferReply({ ephemeral: true });
    const amount = interaction.options.getNumber('amount', true);
    const target = interaction.options.getUser('user', true);
    if (target.id === interaction.user.id) {
      await interaction.editReply({ content: `${EMOJI.error} You can't give coins to yourself!` });
      return;
    }
    if (amount <= 0) {
      await interaction.editReply({ content: `${EMOJI.error} Invalid amount!` });
      return;
    }
    db.ensureUser(interaction.user.id);
    db.ensureUser(target.id);
    const bal = db.getUserBalance(interaction.user.id);
    if (bal < amount) {
      await interaction.editReply({ content: `${EMOJI.error} Insufficient balance! You have ${formatCurrency(bal)}` });
      return;
    }
    db.updateBalance(interaction.user.id, -amount);
    db.updateBalance(target.id, amount);
    await interaction.editReply({ content: `${EMOJI.success} ${formatCurrency(amount)} sent to ${target}!` });
  });

  registerSlash('referral', async (interaction) => {
    await interaction.deferReply();
    db.ensureUser(interaction.user.id);
    const code = db.getReferralCode(interaction.user.id);
    const count = db.getReferralCount(interaction.user.id);
    await interaction.editReply({ embeds: [referralEmbed(code, count)] });
  });

  registerSlash('giveaway', async (interaction) => {
    await interaction.deferReply({ ephemeral: true });
    db.ensureUser(interaction.user.id);
    db.addGiveawayParticipant(interaction.user.id, interaction.channelId);
    await interaction.editReply({ content: `${EMOJI.gift} You've entered the giveaway!` });
  });

  registerSlash('help', async (interaction) => {
    await interaction.reply({ embeds: [helpEmbed()] });
  });

  registerSlash('kick', async (interaction) => {
    if (!isAdmin(interaction)) {
      await interaction.reply({ content: `${EMOJI.error} No permission!`, ephemeral: true });
      return;
    }
    await interaction.deferReply();
    const target = interaction.options.getMember('user');
    const reason = interaction.options.getString('reason') || 'No reason';
    if (!target || !('kickable' in target)) {
      await interaction.editReply({ content: `${EMOJI.error} Invalid user!` });
      return;
    }
    await (target as any).kick(reason);
    await interaction.editReply({ content: `${EMOJI.success} Kicked ${target.user.tag}: ${reason}` });
  });

  registerSlash('ban', async (interaction) => {
    if (!isAdmin(interaction)) {
      await interaction.reply({ content: `${EMOJI.error} No permission!`, ephemeral: true });
      return;
    }
    await interaction.deferReply();
    const target = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason') || 'No reason';
    const deleteDays = interaction.options.getInteger('delete_days') ?? 0;
    await interaction.guild?.members.ban(target, { reason, deleteMessageDays: deleteDays });
    await interaction.editReply({ content: `${EMOJI.success} Banned ${target.tag}: ${reason}` });
  });

  registerSlash('mute', async (interaction) => {
    if (!isAdmin(interaction)) {
      await interaction.reply({ content: `${EMOJI.error} No permission!`, ephemeral: true });
      return;
    }
    await interaction.deferReply();
    const target = interaction.options.getMember('user');
    const duration = interaction.options.getInteger('duration', true);
    const reason = interaction.options.getString('reason') || 'No reason';
    if (!target || !('timeout' in target)) {
      await interaction.editReply({ content: `${EMOJI.error} Invalid user!` });
      return;
    }
    await (target as any).timeout(duration * 60 * 1000, reason);
    await interaction.editReply({ content: `${EMOJI.success} Muted ${target.user.tag} for ${duration} min: ${reason}` });
  });

  registerSlash('unmute', async (interaction) => {
    if (!isAdmin(interaction)) {
      await interaction.reply({ content: `${EMOJI.error} No permission!`, ephemeral: true });
      return;
    }
    await interaction.deferReply();
    const target = interaction.options.getMember('user');
    if (!target || !('timeout' in target)) {
      await interaction.editReply({ content: `${EMOJI.error} Invalid user!` });
      return;
    }
    await (target as any).timeout(null);
    await interaction.editReply({ content: `${EMOJI.success} Unmuted ${target.user.tag}` });
  });

  registerSlash('purge', async (interaction) => {
    if (!isAdmin(interaction)) {
      await interaction.reply({ content: `${EMOJI.error} No permission!`, ephemeral: true });
      return;
    }
    await interaction.deferReply();
    const amount = interaction.options.getInteger('amount', true);
    if (amount < 1 || amount > 100) {
      await interaction.editReply({ content: `${EMOJI.error} Amount must be 1-100!` });
      return;
    }
    const msgs = await interaction.channel?.messages.fetch({ limit: Math.min(amount, 100) });
    if (msgs && interaction.channel && 'bulkDelete' in interaction.channel) {
      await (interaction.channel as any).bulkDelete(msgs, true);
      await interaction.editReply({ content: `${EMOJI.success} Deleted ${msgs.size} messages` });
    }
  });

  registerSlash('slowmode', async (interaction) => {
    if (!isAdmin(interaction)) {
      await interaction.reply({ content: `${EMOJI.error} No permission!`, ephemeral: true });
      return;
    }
    await interaction.deferReply();
    const secs = interaction.options.getInteger('seconds', true);
    if (secs < 0 || secs > 21600) {
      await interaction.editReply({ content: `${EMOJI.error} Must be 0-21600!` });
      return;
    }
    if (interaction.channel && 'setRateLimitPerUser' in interaction.channel) {
      await (interaction.channel as any).setRateLimitPerUser(secs);
      await interaction.editReply({ content: `${EMOJI.success} Slowmode set to ${secs}s` });
    }
  });

  registerSlash('announce', async (interaction) => {
    if (!isAdmin(interaction)) {
      await interaction.reply({ content: `${EMOJI.error} No permission!`, ephemeral: true });
      return;
    }
    await interaction.deferReply();
    const title = interaction.options.getString('title', true);
    const message = interaction.options.getString('message', true);
    const channel = interaction.options.getChannel('channel') || interaction.channel;
    const pingEveryone = interaction.options.getBoolean('ping_everyone') || false;
    if (!channel || !('send' in channel)) {
      await interaction.editReply({ content: `${EMOJI.error} Invalid channel!` });
      return;
    }
    const embed = new EmbedBuilder()
      .setColor(COLORS.gold)
      .setTitle(`\u{1F4E2} ${title}`)
      .setDescription(message)
      .setFooter({ text: `Announced by ${interaction.user.tag}` });
    const content = pingEveryone ? '@everyone' : '';
    await (channel as any).send({ content, embeds: [embed] });
    await interaction.editReply({ content: `${EMOJI.success} Announcement sent!` });
  });
}
