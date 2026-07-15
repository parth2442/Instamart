import { Message, ContainerBuilder, TextDisplayBuilder, EmbedBuilder, MessageFlags, PermissionFlagsBits, ChannelType } from 'discord.js';
import { EMOJI, COLORS, config } from '../config.js';
import { register } from '../prefix.js';
import { formatCurrency } from '../utils.js';
import {
  balanceEmbed, cartEmbed, historyEmbed, wishlistEmbed,
  referralEmbed, deliveryEmbed, orderEmbed, vendingMachineEmbed,
  productDetailEmbed, adminProductListEmbed,
} from '../embeds.js';
import * as db from '../database.js';
import { vendingMachineRows, buildInvMap } from '../handlers/vending.js';
import * as res from '../response.js';
import { sendHelp } from '../help.js';
import { registerPaymentCommands } from './payments.js';
import { postVerifyButton } from '../handlers/verify.js';
import * as modals from '../handlers/modals.js';
import { setLogChannelId } from '../handlers/logger.js';
import { logPurchase } from '../handlers/logger.js';
import { creditReferralReward } from '../handlers/referral.js';
import { updateVendingPanel } from '../handlers/vending.js';
import { bridgeToSlash } from './hybrid.js';

const FOOTER = 'Crafted by Parth.cd';

function containerToEmbed(c: ContainerBuilder): EmbedBuilder {
  try {
    const json = c.toJSON();
    const parts: string[] = [];
    if (Array.isArray(json.components)) {
      for (const comp of json.components) {
        if (comp.type === 10) parts.push(comp.content || '');
        else if (comp.type === 14) parts.push('');
      }
    }
    return new EmbedBuilder()
      .setColor(COLORS.gold)
      .setDescription(parts.join('\n').trim() || '\u200B')
      .setFooter({ text: FOOTER });
  } catch {
    return new EmbedBuilder().setColor(COLORS.gold).setDescription('\u200B').setFooter({ text: FOOTER });
  }
}

function send(msg: Message, content: string | EmbedBuilder | ContainerBuilder | { components?: any[]; embeds?: any[] }) {
  const ch = msg.channel as any;
  let promise;
  if (typeof content === 'string') promise = ch.send({ embeds: [new EmbedBuilder().setColor(COLORS.gold).setDescription(content).setFooter({ text: FOOTER })] });
  else if (content instanceof EmbedBuilder) promise = ch.send({ embeds: [content] });
  else if (content instanceof ContainerBuilder) promise = ch.send({ embeds: [containerToEmbed(content)] });
  else promise = ch.send(content);
  promise?.catch((err: any) => console.error('Send error:', err));
}

function botAvatar(msg: Message): string | undefined {
  return msg.client.user?.displayAvatarURL({ forceStatic: false, size: 256 });
}

function isAdmin(msg: Message): boolean {
  if (config.botOwnerIds.includes(msg.author.id)) return true;
  if (msg.member?.permissions.has('Administrator')) return true;
  if (config.adminRoleId && msg.member?.roles.cache.has(config.adminRoleId)) return true;
  return false;
}

async function isRestocker(msg: Message): Promise<boolean> {
  if (isAdmin(msg)) return true;
  return db.hasPermission(msg.author.id, 'restocker');
}

async function isWalletAdmin(msg: Message): Promise<boolean> {
  if (isAdmin(msg)) return true;
  return db.hasPermission(msg.author.id, 'wallet_admin');
}

export function registerAll() {

  register('help', async (msg) => { await sendHelp(msg); });
  register('h', async (msg) => { await sendHelp(msg); });
  register('commands', async (msg) => { await sendHelp(msg); });

  register('balance', async (msg) => {
    await db.ensureUser(msg.author.id);
    const bal = await db.getUserBalance(msg.author.id);
    const spent = await db.getUserTotalSpent(msg.author.id);
    send(msg, balanceEmbed(msg.author.id, bal, spent, botAvatar(msg)));
  });
  register('bal', async (msg) => {
    await db.ensureUser(msg.author.id);
    const bal = await db.getUserBalance(msg.author.id);
    const spent = await db.getUserTotalSpent(msg.author.id);
    send(msg, balanceEmbed(msg.author.id, bal, spent, botAvatar(msg)));
  });

  register('cart', async (msg) => {
    await db.ensureUser(msg.author.id);
    const items = await db.getCart(msg.author.id);
    const total = await db.getCartTotal(msg.author.id);
    send(msg, cartEmbed(items, total, botAvatar(msg)));
  });

  register('history', async (msg) => {
    await db.ensureUser(msg.author.id);
    const orders = await db.getUserOrders(msg.author.id);
    send(msg, historyEmbed(orders, botAvatar(msg)));
  });

  register('wishlist', async (msg) => {
    await db.ensureUser(msg.author.id);
    const items = await db.getWishlist(msg.author.id);
    send(msg, wishlistEmbed(items, botAvatar(msg)));
  });

  register('give', async (msg, args) => {
    if (args.length < 2) {
      send(msg, `${EMOJI.error} Usage: \`$give AMOUNT @user\``);
      return;
    }
    const amount = parseFloat(args[0]);
    if (isNaN(amount) || amount <= 0) {
      send(msg, `${EMOJI.error} Invalid amount!`);
      return;
    }
    const targetId = args[1].replace(/[<@!>]/g, '');
    if (targetId === msg.author.id) {
      send(msg, `${EMOJI.error} You can't give coins to yourself!`);
      return;
    }
    await db.ensureUser(msg.author.id);
    await db.ensureUser(targetId);
    const ok = await db.deductBalance(msg.author.id, amount);
    if (!ok) {
      const bal = await db.getUserBalance(msg.author.id);
      send(msg, `${EMOJI.error} Insufficient balance! You have ${formatCurrency(bal)}`);
      return;
    }
    await db.updateBalance(targetId, amount);
    send(msg, `${EMOJI.success} ${formatCurrency(amount)} sent to <@${targetId}>!`);
  });

  register('referral', async (msg) => {
    await db.ensureUser(msg.author.id);
    const code = await db.getReferralCode(msg.author.id);
    const count = await db.getReferralCount(msg.author.id);
    send(msg, referralEmbed(code ?? '', count, botAvatar(msg)));
  });
  register('refer', async (msg) => {
    await db.ensureUser(msg.author.id);
    const code = await db.getReferralCode(msg.author.id);
    const count = await db.getReferralCount(msg.author.id);
    send(msg, referralEmbed(code ?? '', count, botAvatar(msg)));
  });

  register('kick', async (msg, args) => {
    if (!isAdmin(msg)) { send(msg, `${EMOJI.error} No permission!`); return; }
    if (args.length < 1) { send(msg, `Usage: \`$kick @user [reason]\``); return; }
    const target = msg.mentions.members?.first();
    if (!target) { send(msg, `${EMOJI.error} Mention a valid user!`); return; }
    const reason = args.slice(1).join(' ') || 'No reason';
    await target.kick(reason);
    send(msg, `${EMOJI.success} Kicked ${target.user.username}: ${reason}`);
  });

  register('ban', async (msg, args) => {
    if (!isAdmin(msg)) { send(msg, `${EMOJI.error} No permission!`); return; }
    if (args.length < 1) { send(msg, `Usage: \`$ban @user [reason]\``); return; }
    const target = msg.mentions.members?.first();
    if (!target) { send(msg, `${EMOJI.error} Mention a valid user!`); return; }
    const reason = args.slice(1).join(' ') || 'No reason';
    await target.ban({ reason });
    send(msg, `${EMOJI.success} Banned ${target.user.username}: ${reason}`);
  });

  register('mute', async (msg, args) => {
    if (!isAdmin(msg)) { send(msg, `${EMOJI.error} No permission!`); return; }
    if (args.length < 2) { send(msg, `Usage: \`$mute @user minutes [reason]\``); return; }
    const target = msg.mentions.members?.first();
    if (!target) { send(msg, `${EMOJI.error} Mention a valid user!`); return; }
    const mins = parseInt(args[1]);
    if (isNaN(mins) || mins < 1) { send(msg, `${EMOJI.error} Invalid minutes!`); return; }
    const reason = args.slice(2).join(' ') || 'No reason';
    await target.timeout(mins * 60 * 1000, reason);
    send(msg, `${EMOJI.success} Muted ${target.user.tag} for ${mins} min: ${reason}`);
  });

  register('unmute', async (msg, args) => {
    if (!isAdmin(msg)) { send(msg, `${EMOJI.error} No permission!`); return; }
    if (args.length < 1) { send(msg, `Usage: \`$unmute @user\``); return; }
    const target = msg.mentions.members?.first();
    if (!target) { send(msg, `${EMOJI.error} Mention a valid user!`); return; }
    await target.timeout(null);
    send(msg, `${EMOJI.success} Unmuted ${target.user.tag}`);
  });

  register('purge', async (msg, args) => {
    if (!isAdmin(msg)) { send(msg, `${EMOJI.error} No permission!`); return; }
    const amount = parseInt(args[0] || '10');
    if (isNaN(amount) || amount < 1 || amount > 100) { send(msg, `${EMOJI.error} Amount must be 1-100`); return; }
    const msgs = await msg.channel.messages.fetch({ limit: Math.min(amount, 100) });
    if ('bulkDelete' in msg.channel && typeof (msg.channel as any).bulkDelete === 'function') {
      await (msg.channel as any).bulkDelete(msgs, true);
      send(msg, `${EMOJI.success} Deleted ${msgs.size} messages`);
    }
  });

  register('slowmode', async (msg, args) => {
    if (!isAdmin(msg)) { send(msg, `${EMOJI.error} No permission!`); return; }
    const secs = parseInt(args[0] || '0');
    if (isNaN(secs) || secs < 0 || secs > 21600) { send(msg, `${EMOJI.error} Must be 0-21600`); return; }
    if ('setRateLimitPerUser' in msg.channel && typeof (msg.channel as any).setRateLimitPerUser === 'function') {
      await (msg.channel as any).setRateLimitPerUser(secs);
      send(msg, `${EMOJI.success} Slowmode set to ${secs}s`);
    }
  });
  register('sm', async (msg, args) => {
    if (!isAdmin(msg)) { send(msg, `${EMOJI.error} No permission!`); return; }
    const secs = parseInt(args[0] || '0');
    if (isNaN(secs) || secs < 0 || secs > 21600) { send(msg, `${EMOJI.error} Must be 0-21600`); return; }
    if ('setRateLimitPerUser' in msg.channel && typeof (msg.channel as any).setRateLimitPerUser === 'function') {
      await (msg.channel as any).setRateLimitPerUser(secs);
      send(msg, `${EMOJI.success} Slowmode set to ${secs}s`);
    }
  });

  register('announce', async (msg, args) => {
    if (!isAdmin(msg)) { send(msg, `${EMOJI.error} No permission!`); return; }
    const match = msg.content.match(/"([^"]+)"\s+"([^"]+)"(?:\s+<#(\d+)>)?/);
    if (!match) { send(msg, `Usage: \`$announce "title" "message" [#channel]\``); return; }
    const title = match[1];
    const message = match[2];
    const channelId = match[3] || msg.channelId;
    const channel = msg.guild?.channels.cache.get(channelId);
    if (!channel || !channel.isTextBased()) { send(msg, `${EMOJI.error} Invalid channel!`); return; }
    const announceEmbed = new EmbedBuilder()
      .setColor(COLORS.gold)
      .setTitle(`\u{1F4E2} ${title}`)
      .setDescription(message)
      .setFooter({ text: `Announced by ${msg.author.tag}` });
    await (channel as any).send({ embeds: [announceEmbed] });
    send(msg, `${EMOJI.success} Announcement sent!`);
  });
  register('ann', async (msg, args) => {
    if (!isAdmin(msg)) { send(msg, `${EMOJI.error} No permission!`); return; }
    const match = msg.content.match(/"([^"]+)"\s+"([^"]+)"(?:\s+<#(\d+)>)?/);
    if (!match) { send(msg, `Usage: \`$announce "title" "message" [#channel]\``); return; }
    const title = match[1];
    const message = match[2];
    const channelId = match[3] || msg.channelId;
    const channel = msg.guild?.channels.cache.get(channelId);
    if (!channel || !channel.isTextBased()) { send(msg, `${EMOJI.error} Invalid channel!`); return; }
    const announceEmbed = new EmbedBuilder()
      .setColor(COLORS.gold)
      .setTitle(`\u{1F4E2} ${title}`)
      .setDescription(message)
      .setFooter({ text: `Announced by ${msg.author.tag}` });
    await (channel as any).send({ embeds: [announceEmbed] });
    send(msg, `${EMOJI.success} Announcement sent!`);
  });

  register('postshop', async (msg, args) => {
    if (!isAdmin(msg)) { send(msg, `${EMOJI.error} No permission!`); return; }
    const force = args.includes('--force') || args.includes('-f');
    let channel: any = msg.channel;
    if (args.length > 0) {
      const channelArg = args.find(a => a.startsWith('<#') || a.startsWith('#')) || '';
      const channelId = channelArg.replace(/[<#>]/g, '');
      const c = msg.guild?.channels.cache.get(channelId);
      if (c && c.isTextBased()) channel = c;
    }
    const cats = await db.getCategories();
    if (cats.length === 0) { send(msg, `${EMOJI.error} No categories! Add one first.`); return; }

    // Try to update existing shop message first (unless --force)
    if (!force) {
      const channelId = await db.getShopChannel();
      const msgId = await db.getSetting('shop_message_id');
      if (channelId && msgId) {
        const oldChannel = msg.guild?.channels.cache.get(channelId);
        if (oldChannel && (oldChannel as any).isTextBased()) {
          try {
            const oldMsg = await (oldChannel as any).messages.fetch(msgId);
            if (oldMsg) {
              const prods = await db.getProductsByCategory(cats[0].id);
              const invMap = await buildInvMap(prods);
              const bal = await db.getUserBalance(msg.author.id);
              const view = vendingMachineEmbed(cats[0], prods, bal, botAvatar(msg), invMap);
              const rows = vendingMachineRows(cats, prods, invMap);
              await oldMsg.edit({ flags: MessageFlags.IsComponentsV2, components: [view, ...rows] });
              send(msg, `${EMOJI.success} Vending machine updated in <#${channelId}>!`);
              return;
            }
          } catch {}
        }
      }
    }

    const prods = await db.getProductsByCategory(cats[0].id);
    const invMap = await buildInvMap(prods);
    const bal = await db.getUserBalance(msg.author.id);
    const view = vendingMachineEmbed(cats[0], prods, bal, botAvatar(msg), invMap);
    const rows = vendingMachineRows(cats, prods, invMap);
    if (!channel || !('send' in channel)) { send(msg, `${EMOJI.error} Invalid channel!`); return; }
    const sent = await (channel as any).send({ flags: MessageFlags.IsComponentsV2, components: [view, ...rows] });
    await db.setShopChannel(channel.id);
    await db.setSetting('shop_message_id', sent.id);
    send(msg, `${EMOJI.success} Vending machine posted in <#${channel.id}>!`);
  });

  register('admin', async (msg, args) => {
    if (!isAdmin(msg)) { send(msg, `${EMOJI.error} No permission!`); return; }
    if (args.length < 1) { send(msg, `Usage: \`$admin products|orders|deposit|coupon|analytics ...\``); return; }
    const sub = args[0].toLowerCase();

    if (sub === 'products') {
      if (args[1] === 'list') {
        const prods = await db.getAllProducts();
        const cats = await db.getCategories();
        send(msg, { embeds: [containerToEmbed(adminProductListEmbed(prods, cats, botAvatar(msg)))] });
      } else if (args[1] === 'add') {
        if (args.length < 6) { send(msg, `Usage: \`$admin products add SLOTID NAME PRICE CATEGORY_ID [stock] [price_usd]\``); return; }
        const slot = args[2].toUpperCase();
        const name = args[3];
        const price = parseFloat(args[4]);
        const catId = parseInt(args[5]);
        const stock = args[6] ? parseInt(args[6]) : -1;
        const priceUsd = args[7] ? parseFloat(args[7]) : undefined;
        if (isNaN(price) || isNaN(catId)) { send(msg, `${EMOJI.error} Invalid price or category!`); return; }
        await db.addProduct(slot, name, '', price, catId, stock, priceUsd);
        send(msg, `${EMOJI.success} Product \`[${slot}]\` ${name} added!`);
      } else if (args[1] === 'edit') {
        if (args.length < 4) { send(msg, `Usage: \`$admin products edit SLOTID field value\`\nFields: name, price, stock, description, howtouse, active`); return; }
        const slot = args[2].toUpperCase();
        const field = args[3].toLowerCase();
        const val = args.slice(4).join(' ');
        const product = await db.getProductBySlot(slot);
        if (!product) { send(msg, `${EMOJI.error} Product not found!`); return; }
        const update: any = {};
        if (field === 'name') update.name = val;
        else if (field === 'price') update.price = parseFloat(val);
        else if (field === 'stock') update.stock = parseInt(val);
        else if (field === 'description') update.description = val;
        else if (field === 'howtouse') update.how_to_use = val;
        else if (field === 'active') update.is_active = val === 'true' || val === '1';
        else { send(msg, `${EMOJI.error} Unknown field!`); return; }
        await db.editProduct(slot, update);
        send(msg, `${EMOJI.success} Product \`[${slot}]\` updated!`);
      } else if (args[1] === 'remove') {
        if (args.length < 3) { send(msg, `Usage: \`$admin products remove SLOTID\``); return; }
        const slot = args[2].toUpperCase();
        await db.removeProduct(slot);
        send(msg, `${EMOJI.success} Product \`[${slot}]\` removed!`);
      } else {
        send(msg, `Usage: \`$admin products list|add|edit|remove\``);
      }
    } else if (sub === 'orders') {
      if (args[1] === 'list') {
        const status = args[2];
        const orders = await db.getAllOrders(status);
        if (orders.length === 0) { send(msg, `${EMOJI.warning} No orders found.`); return; }
        let desc = '';
        for (const o of orders) {
          desc += `\`${o.id.slice(0, 8)}\` <@${o.user_id}> \u{2022} ${formatCurrency(o.total_amount)} \u{2022} \`${o.status}\`\n`;
        }
        send(msg, new EmbedBuilder()
          .setColor(COLORS.gold)
          .setTitle('\u{1F4CB} Orders')
          .setDescription(desc)
          .setFooter({ text: FOOTER }));
      } else if (args[1] === 'view') {
        if (args.length < 3) { send(msg, `Usage: \`$admin orders view ORDER_ID\``); return; }
        const order = await db.getOrder(args[2]);
        if (!order) { send(msg, `${EMOJI.error} Order not found!`); return; }
        const items = await db.getOrderItems(args[2]);
        send(msg, orderEmbed(order, items, botAvatar(msg)));
      } else {
        send(msg, `Usage: \`$admin orders list|view\``);
      }
    } else if (sub === 'deposit') {
      if (args.length < 3) { send(msg, `Usage: \`$admin deposit @user AMOUNT\``); return; }
      const targetId = args[1].replace(/[<@!>]/g, '');
      const amount = parseFloat(args[2]);
      if (isNaN(amount) || amount <= 0) { send(msg, `${EMOJI.error} Invalid amount!`); return; }
      await db.ensureUser(targetId);
      await db.updateBalance(targetId, amount);
      send(msg, `${EMOJI.success} ${formatCurrency(amount)} added to <@${targetId}>!`);
    } else if (sub === 'coupon') {
      if (args.length < 3) { send(msg, `Usage: \`$admin coupon CODE DISCOUNT% [minPurchase] [maxUses]\``); return; }
      const code = args[1].toUpperCase();
      const discount = parseInt(args[2]);
      const minPurchase = args[3] ? parseFloat(args[3]) : 0;
      const maxUses = args[4] ? parseInt(args[4]) : 0;
      if (isNaN(discount) || discount < 1 || discount > 100) { send(msg, `${EMOJI.error} Discount must be 1-100!`); return; }
      await db.createCoupon(code, discount, minPurchase, maxUses);
      send(msg, `${EMOJI.success} Coupon \`${code}\` created (${discount}% off)!`);
    } else if (sub === 'analytics') {
      const revenue = await db.getTotalRevenue();
      const orderCount = await db.getOrderCount();
      const top = await db.getTopProducts();
      let desc = `**Revenue:** ${formatCurrency(revenue)}\n**Orders:** ${orderCount}\n\n**Top Products:**\n`;
      for (const p of top) {
        desc += `\u{2022} **${p.name}** \u{2014} ${formatCurrency(p.total)} (${p.count} sold)\n`;
      }
      send(msg, new EmbedBuilder()
        .setColor(COLORS.gold)
        .setTitle('\u{1F4CA} Analytics')
        .setDescription(desc)
        .setFooter({ text: FOOTER }));
    } else {
      send(msg, `Usage: \`$admin products|orders|deposit|coupon|analytics\``);
    }
  });

  register('restock', async (msg, args) => {
    if (!(await isRestocker(msg))) { send(msg, `${EMOJI.error} No permission!`); return; }
    if (args.length < 2) { send(msg, `Usage: \`$restock SLOT_ID AMOUNT\``); return; }
    const slot = args[0].toUpperCase();
    const amount = parseInt(args[1]);
    if (isNaN(amount) || amount < -1) { send(msg, `${EMOJI.error} Invalid amount! (-1 for unlimited)`); return; }
    const product = await db.getProductBySlot(slot);
    if (!product) { send(msg, `${EMOJI.error} Product not found!`); return; }
    await db.setProductStock(product.id, amount);
    send(msg, `${EMOJI.success} \`[${slot}]\` stock set to ${amount === -1 ? 'unlimited' : amount}!`);
  });

  register('stock', async (msg, args) => {
    if (!(await isRestocker(msg))) { send(msg, `${EMOJI.error} No permission!`); return; }
    if (args.length < 2) { send(msg, `Usage: \`$stock SLOT_ID add|bulk|list [codes...]\``); return; }
    const slot = args[0].toUpperCase();
    const action = args[1].toLowerCase();
    const product = await db.getProductBySlot(slot);
    if (!product) { send(msg, `${EMOJI.error} Product \`[${slot}]\` not found!`); return; }

    if (action === 'add') {
      if (args.length < 3) { send(msg, `Usage: \`$stock SLOT_ID add CODE\``); return; }
      const code = args.slice(2).join(' ');
      await db.addInventoryCode(product.id, code);
      const cnt = await db.getInventoryCount(product.id);
      send(msg, `${EMOJI.success} Code added to **${product.name}** \u{2014} ${cnt.available} available, ${cnt.sold} sold`);
    } else if (action === 'bulk') {
      if (args.length < 3) { send(msg, `Usage: \`$stock SLOT_ID bulk <code1> <code2> ...\``); return; }
      const codes = args.slice(2);
      const added = await db.addInventoryCodesBulk(product.id, codes);
      const cnt = await db.getInventoryCount(product.id);
      send(msg, `${EMOJI.success} ${added} codes added to **${product.name}** \u{2014} ${cnt.available} available, ${cnt.sold} sold`);
    } else if (action === 'list') {
      const items = await db.listInventoryCodes(product.id);
      if (items.length === 0) { send(msg, `${EMOJI.warning} No codes for **${product.name}**`); return; }
      const cnt = await db.getInventoryCount(product.id);
      let desc = '';
      for (const item of items) {
        const status = item.is_sold ? 'Sold' : 'Available';
        desc += `\`${item.code}\` \u{2014} ${status}\n`;
      }
      desc += `\n${cnt.available} available, ${cnt.sold} sold`;
      send(msg, new EmbedBuilder()
        .setColor(COLORS.gold)
        .setDescription(desc)
        .setFooter({ text: FOOTER }));
    } else {
      send(msg, `Usage: \`$stock SLOT_ID add|bulk|list\``);
    }
  });

  register('deposit', async (msg, args) => {
    if (!(await isWalletAdmin(msg))) { send(msg, `${EMOJI.error} No permission!`); return; }
    if (args.length < 2) { send(msg, `Usage: \`$deposit @user AMOUNT\``); return; }
    const targetId = args[0].replace(/[<@!>]/g, '');
    const amount = parseFloat(args[1]);
    if (isNaN(amount) || amount <= 0) { send(msg, `${EMOJI.error} Invalid amount!`); return; }
    await db.ensureUser(targetId);
    await db.updateBalance(targetId, amount);
    send(msg, `${EMOJI.success} ${formatCurrency(amount)} deposited to <@${targetId}>!`);
  });

  register('deliver', async (msg, args) => {
    if (!isAdmin(msg)) { send(msg, `${EMOJI.error} No permission!`); return; }
    if (args.length < 2) { send(msg, `Usage: \`$deliver ORDER_ID CODE\``); return; }
    const orderId = args[0];
    const code = args.slice(1).join(' ');
    const order = await db.getOrder(orderId);
    if (!order) { send(msg, `${EMOJI.error} Order not found!`); return; }
    const items = await db.getOrderItems(orderId);
    const pendingItem = items.find(i => i.delivery_status === 'pending');
    if (!pendingItem) { send(msg, `${EMOJI.error} No pending item in this order!`); return; }
    await db.updateDeliveryMessage(pendingItem.id, code);
    try {
      const member = await msg.guild?.members.fetch(order.user_id);
      if (member) {
        const embed = containerToEmbed(await deliveryEmbed(items, botAvatar(msg)));
        member.send({ embeds: [embed] }).catch(() => {});
      }
    } catch {}
    send(msg, `${EMOJI.success} Code delivered to order \`${orderId.slice(0, 8)}\`!`);
  });

  register('restocker', async (msg, args) => {
    if (!isAdmin(msg)) { send(msg, `${EMOJI.error} No permission!`); return; }
    if (args.length < 2) { send(msg, `Usage: \`$restocker add|remove @user\``); return; }
    const action = args[0].toLowerCase();
    const targetId = args[1].replace(/[<@!>]/g, '');
    if (action === 'add') {
      await db.setUserPermission(targetId, 'restocker', true);
      send(msg, `${EMOJI.success} <@${targetId}> is now a **Restocker**!`);
    } else if (action === 'remove') {
      await db.setUserPermission(targetId, 'restocker', false);
      send(msg, `${EMOJI.success} Removed **Restocker** from <@${targetId}>`);
    } else {
      send(msg, `Usage: \`$restocker add|remove @user\``);
    }
  });

  register('walletadmin', async (msg, args) => {
    if (!isAdmin(msg)) { send(msg, `${EMOJI.error} No permission!`); return; }
    if (args.length < 2) { send(msg, `Usage: \`$walletadmin add|remove @user\``); return; }
    const action = args[0].toLowerCase();
    const targetId = args[1].replace(/[<@!>]/g, '');
    if (action === 'add') {
      await db.setUserPermission(targetId, 'wallet_admin', true);
      send(msg, `${EMOJI.success} <@${targetId}> is now a **Wallet Admin**!`);
    } else if (action === 'remove') {
      await db.setUserPermission(targetId, 'wallet_admin', false);
      send(msg, `${EMOJI.success} Removed **Wallet Admin** from <@${targetId}>`);
    } else {
      send(msg, `Usage: \`$walletadmin add|remove @user\``);
    }
  });

  registerPaymentCommands();

  // ── Payment Admin Commands ──

  register('verify', async (msg, args) => {
    if (!isAdmin(msg)) { send(msg, `${EMOJI.error} No permission!`); return; }
    const orderId = args[0];
    if (!orderId) { send(msg, `Usage: \`$verify ORDER_ID\``); return; }

    const orders = await db.getAllOrders();
    const order = orders.find((o: any) => o.id.startsWith(orderId.toUpperCase()) || o.id === orderId);
    if (!order) { send(msg, `${EMOJI.error} Order not found!`); return; }

    const payment = await db.getPaymentByOrder(order.id);
    if (!payment || payment.method !== 'upi') { send(msg, `${EMOJI.error} Payment not found or not UPI!`); return; }
    if (payment.status !== 'paid') { send(msg, `${EMOJI.warning} Payment is ${payment.status}.`); return; }

    await db.updatePaymentSession(payment.token, { status: 'verified', verifiedBy: msg.author.id, verifiedAt: new Date() });

    const { allDelivered } = await modals.deliverOrderItems(order.id, order.user_id);
    await db.updateTotalSpent(order.user_id, payment.amount);
    creditReferralReward(order.user_id, payment.amount);
    updateVendingPanel(msg.client);
    const orderItems = await db.getOrderItems(order.id);
    logPurchase(msg.client, {
      buyerId: order.user_id, total: payment.amount, method: 'upi', orderId: order.id,
      items: orderItems.map((i: any) => ({ name: i.product_name, qty: i.quantity, price: i.unit_price })),
      status: 'verified',
    });
    if (allDelivered) {
      await modals.sendDeliveryDM(msg, order.id, order.user_id);
    }

    send(msg, `${EMOJI.success} Payment for \`${order.id.slice(0, 8)}\` verified! ${allDelivered ? 'Items delivered.' : 'Manual delivery needed.'}`);
  });

  register('payments', async (msg, args) => {
    if (!isAdmin(msg)) { send(msg, `${EMOJI.error} No permission!`); return; }
    const method = args[0]?.toLowerCase();
    const payments = await db.getAllPendingPayments(method);

    if (payments.length === 0) {
      send(msg, `${EMOJI.warning} No pending payments.`);
      return;
    }

    let desc = '';
    for (const p of payments) {
      const statusEmoji = p.status === 'verified' ? '\u{2705}' : p.status === 'paid' ? '\u{1F7E2}' : p.status === 'pending' ? '\u{1F7E1}' : '\u{274C}';
      const methodEmoji = p.method === 'upi' ? '\u{1F4B1}' : '\u{1F3E6}';
      desc += `${statusEmoji} ${methodEmoji} \`${p.orderId.slice(0, 8)}\` <@${p.userId}> ${formatCurrency(p.amount)}`;
      if (p.utr) desc += ` UTR: \`${p.utr}\``;
      if (p.txHash) desc += ` TX: \`${p.txHash.slice(0, 12)}...\``;
      desc += '\n';
    }

    send(msg, new EmbedBuilder()
      .setColor(COLORS.gold)
      .setTitle('\u{1F4B0} Payment Queue')
      .setDescription(desc)
      .setFooter({ text: `Use $verify ORDER_ID to confirm | Total: ${payments.length}` }));
  });

  register('setlog', async (msg, args) => {
    if (!isAdmin(msg)) { send(msg, `${EMOJI.error} No permission!`); return; }
    const channel = msg.mentions.channels.first();
    if (!channel) { send(msg, `${EMOJI.error} Mention a channel: \`$setlog #logs\``); return; }
    await db.setSetting('log_channel', channel.id);
    setLogChannelId(channel.id);
    send(msg, `${EMOJI.success} Log channel set to ${channel}!`);
  });

  register('setupverify', async (msg, args) => {
    if (!isAdmin(msg)) { send(msg, `${EMOJI.error} No permission!`); return; }

    const guild = msg.guild;
    if (!guild) return;

    const isAuto = args.includes('--auto') || args.includes('-a');

    if (isAuto) {
      // Auto mode: create role, channel, lock everything
      const botMember = await guild.members.fetchMe();
      if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles) || !botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
        return send(msg, `${EMOJI.error} I need Manage Roles & Manage Channels permissions!`);
      }

      // 1. Create or find Verified role
      let role = guild.roles.cache.find(r => r.name === 'Verified');
      if (!role) {
        role = await guild.roles.create({
          name: 'Verified',
          color: 0xD4AF37,
          reason: 'Auto verify setup',
        });
      }

      // 2. Create verify channel (or use existing)
      let verifyCh = guild.channels.cache.find(c => c.name === 'verify' && c.type === ChannelType.GuildText) as any;
      if (!verifyCh) {
        verifyCh = await guild.channels.create({
          name: 'verify',
          type: ChannelType.GuildText,
          permissionOverwrites: [
            { id: guild.roles.everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory] },
            { id: role.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory] },
            { id: botMember.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages] },
          ],
          reason: 'Auto verify setup',
        });
        await (verifyCh as any).setPosition(0);
      } else {
        await (verifyCh as any).permissionOverwrites.edit(guild.roles.everyone, { ViewChannel: true, ReadMessageHistory: true });
        await (verifyCh as any).permissionOverwrites.edit(role.id, { ViewChannel: true, ReadMessageHistory: true });
      }

      // 3. Lock all other channels behind Verified role
      for (const ch of guild.channels.cache.values()) {
        if (ch.id === verifyCh.id) continue;
        try {
          (ch as any).permissionOverwrites?.edit(guild.roles.everyone, { ViewChannel: false });
          (ch as any).permissionOverwrites?.edit(role.id, { ViewChannel: true });
        } catch {}
      }

      await db.setVerifyChannel(verifyCh.id);
      await db.setVerifyRole(role.id);

      // 4. Post verify button
      const sent = await postVerifyButton(verifyCh);
      send(msg, `${EMOJI.success} Auto verify setup done!\nChannel: ${verifyCh}\nRole: ${role}\nAll other channels locked.`);
      return;
    }

    // Manual mode
    const channel = msg.mentions.channels.first();
    const role = msg.mentions.roles.first();
    if (!channel || !role) { send(msg, `${EMOJI.error} Usage: \`$setupverify #channel @role\` or \`$setupverify --auto\``); return; }
    await db.setVerifyChannel(channel.id);
    await db.setVerifyRole(role.id);
    await postVerifyButton(channel);
    send(msg, `${EMOJI.success} Verify channel set to ${channel} with role ${role}. Button posted!`);
  });

  // ── Bridge prefix-only commands to slash ──
  const bridges: [string, string][] = [
    ['postshop', 'Post/update the vending machine shop panel'],
    ['admin', 'Admin panel — manage products, orders, coupons, and more'],
    ['restock', 'Set product stock quantity'],
    ['stock', 'Manage inventory codes (add/bulk/list)'],
    ['deposit', 'Deposit coins to a user'],
    ['deliver', 'Deliver order items with codes'],
    ['restocker', 'Grant or remove restocker role'],
    ['walletadmin', 'Grant or remove wallet admin role'],
    ['verify', 'Verify a UPI payment order manually'],
    ['payments', 'View pending payment queue'],
    ['setlog', 'Set the log channel'],
  ];
  for (const [cmd, desc] of bridges) {
    bridgeToSlash(cmd, desc);
  }
}
