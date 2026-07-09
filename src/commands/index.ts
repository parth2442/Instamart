import { Message, EmbedBuilder, TextBasedChannel } from 'discord.js';
import { EMOJI, COLORS, config } from '../config.js';
import { register } from '../prefix.js';
import { formatCurrency, generateOrderId } from '../utils.js';
import { helpEmbed, balanceEmbed, cartEmbed, historyEmbed, wishlistEmbed, referralEmbed, deliveryEmbed, orderEmbed, vendingMachineEmbed, productDetailEmbed, adminProductListEmbed } from '../embeds.js';
import * as db from '../database.js';
import { vendingMachineRows } from '../handlers/vending.js';
import * as res from '../response.js';
import { sendHelp } from '../help.js';
import { sendRules } from '../rules.js';

// Helper to safely send messages (auto-wraps strings in gold Container-style embeds)
function send(msg: Message, content: string | EmbedBuilder | { embeds: EmbedBuilder[]; components?: any[] }) {
  const ch = msg.channel as any;
  if (typeof content === 'string') return ch.send({ embeds: [res.gold(content)] });
  if (content instanceof EmbedBuilder) return ch.send({ embeds: [content] });
  return ch.send(content);
}

function botAvatar(msg: Message): string | undefined {
  return msg.client.user?.displayAvatarURL({ forceStatic: false, size: 256 });
}

// ─── Auth helpers ───

function isAdmin(msg: Message): boolean {
  if (msg.author.id === config.botOwnerId) return true;
  if (msg.member?.permissions.has('Administrator')) return true;
  if (config.adminRoleId && msg.member?.roles.cache.has(config.adminRoleId)) return true;
  return false;
}

function isRestocker(msg: Message): boolean {
  if (isAdmin(msg)) return true;
  return db.hasPermission(msg.author.id, 'restocker');
}

function isWalletAdmin(msg: Message): boolean {
  if (isAdmin(msg)) return true;
  return db.hasPermission(msg.author.id, 'wallet_admin');
}

// ─── Register all prefix commands ───

export function registerAll() {

  // ── Help ──
  register('help', async (msg) => { await sendHelp(msg); });
  register('h', async (msg) => { await sendHelp(msg); });
  register('commands', async (msg) => { await sendHelp(msg); });

  // ── Balance ──
  register('balance', (msg) => {
    db.ensureUser(msg.author.id);
    const bal = db.getUserBalance(msg.author.id);
    const spent = db.getUserTotalSpent(msg.author.id);
    send(msg, balanceEmbed(msg.author.id, bal, spent, botAvatar(msg)));
  });
  register('bal', (msg) => {
    db.ensureUser(msg.author.id);
    const bal = db.getUserBalance(msg.author.id);
    const spent = db.getUserTotalSpent(msg.author.id);
    send(msg, balanceEmbed(msg.author.id, bal, spent, botAvatar(msg)));
  });

  // ── Cart ──
  register('cart', (msg) => {
    db.ensureUser(msg.author.id);
    const items = db.getCart(msg.author.id);
    const total = db.getCartTotal(msg.author.id);
    send(msg, cartEmbed(items, total, botAvatar(msg)));
  });

  // ── History ──
  register('history', (msg) => {
    db.ensureUser(msg.author.id);
    const orders = db.getUserOrders(msg.author.id);
    send(msg, historyEmbed(orders, botAvatar(msg)));
  });

  // ── Wishlist ──
  register('wishlist', (msg) => {
    db.ensureUser(msg.author.id);
    const items = db.getWishlist(msg.author.id);
    send(msg, wishlistEmbed(items, botAvatar(msg)));
  });

  // ── Give ──
  register('give', (msg, args) => {
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
    db.ensureUser(msg.author.id);
    db.ensureUser(targetId);
    const bal = db.getUserBalance(msg.author.id);
    if (bal < amount) {
      send(msg, `${EMOJI.error} Insufficient balance! You have ${formatCurrency(bal)}`);
      return;
    }
    db.updateBalance(msg.author.id, -amount);
    db.updateBalance(targetId, amount);
    send(msg, `${EMOJI.success} ${formatCurrency(amount)} sent to <@${targetId}>!`);
  });

  // ── Referral ──
  register('referral', (msg) => {
    db.ensureUser(msg.author.id);
    const code = db.getReferralCode(msg.author.id);
    const count = db.getReferralCount(msg.author.id);
    send(msg, referralEmbed(code, count, botAvatar(msg)));
  });
  register('refer', (msg) => {
    db.ensureUser(msg.author.id);
    const code = db.getReferralCode(msg.author.id);
    const count = db.getReferralCount(msg.author.id);
    send(msg, referralEmbed(code, count, botAvatar(msg)));
  });

  // ── Giveaway ── (removed)

  // ── Kick ──
  register('kick', async (msg, args) => {
    if (!isAdmin(msg)) { send(msg, `${EMOJI.error} No permission!`); return; }
    if (args.length < 1) { send(msg, `Usage: \`$kick @user [reason]\``); return; }
    const target = msg.mentions.members?.first();
    if (!target) { send(msg, `${EMOJI.error} Mention a valid user!`); return; }
    const reason = args.slice(1).join(' ') || 'No reason';
    await target.kick(reason);
    send(msg, `${EMOJI.success} Kicked ${target.user.tag}: ${reason}`);
  });

  // ── Ban ──
  register('ban', async (msg, args) => {
    if (!isAdmin(msg)) { send(msg, `${EMOJI.error} No permission!`); return; }
    if (args.length < 1) { send(msg, `Usage: \`$ban @user [reason]\``); return; }
    const target = msg.mentions.members?.first();
    if (!target) { send(msg, `${EMOJI.error} Mention a valid user!`); return; }
    const reason = args.slice(1).join(' ') || 'No reason';
    await target.ban({ reason });
    send(msg, `${EMOJI.success} Banned ${target.user.tag}: ${reason}`);
  });

  // ── Mute ──
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

  // ── Unmute ──
  register('unmute', async (msg, args) => {
    if (!isAdmin(msg)) { send(msg, `${EMOJI.error} No permission!`); return; }
    if (args.length < 1) { send(msg, `Usage: \`$unmute @user\``); return; }
    const target = msg.mentions.members?.first();
    if (!target) { send(msg, `${EMOJI.error} Mention a valid user!`); return; }
    await target.timeout(null);
    send(msg, `${EMOJI.success} Unmuted ${target.user.tag}`);
  });

  // ── Purge ──
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

  // ── Slowmode ──
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

  // ── Announce ──
  register('announce', async (msg, args) => {
    if (!isAdmin(msg)) { send(msg, `${EMOJI.error} No permission!`); return; }
    const match = msg.content.match(/"([^"]+)"\s+"([^"]+)"(?:\s+<#(\d+)>)?/);
    if (!match) { send(msg, `Usage: \`$announce "title" "message" [#channel]\``); return; }
    const title = match[1];
    const message = match[2];
    const channelId = match[3] || msg.channelId;
    const channel = msg.guild?.channels.cache.get(channelId);
    if (!channel || !channel.isTextBased()) { send(msg, `${EMOJI.error} Invalid channel!`); return; }
    const embed = new EmbedBuilder()
      .setColor(COLORS.gold)
      .setTitle(`\u{1F4E2} ${title}`)
      .setDescription(message)
      .setFooter({ text: `Announced by ${msg.author.tag}` });
    await channel.send({ embeds: [embed] });
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
    const embed = new EmbedBuilder()
      .setColor(COLORS.gold)
      .setTitle(`\u{1F4E2} ${title}`)
      .setDescription(message)
      .setFooter({ text: `Announced by ${msg.author.tag}` });
    await channel.send({ embeds: [embed] });
    send(msg, `${EMOJI.success} Announcement sent!`);
  });

  // ── Rules (Admin) ──
  register('rules', async (msg) => {
    if (!isAdmin(msg)) { send(msg, `${EMOJI.error} No permission!`); return; }
    await sendRules(msg);
  });

  // ── Post Shop ──
  register('postshop', async (msg, args) => {
    if (!isAdmin(msg)) { send(msg, `${EMOJI.error} No permission!`); return; }
    let channel: any = msg.channel;
    if (args.length > 0) {
      const channelId = args[0].replace(/[<#>]/g, '');
      const c = msg.guild?.channels.cache.get(channelId);
      if (c && c.isTextBased()) channel = c;
    }
    const cats = db.getCategories();
    if (cats.length === 0) { send(msg, `${EMOJI.error} No categories! Add one first.`); return; }
    const prods = db.getProductsByCategory(cats[0].id);
    const bal = db.getUserBalance(msg.author.id);
    const embed = vendingMachineEmbed(cats[0], prods, bal, botAvatar(msg));
    const rows = vendingMachineRows(cats, prods);
    if (!channel || !('send' in channel)) { send(msg, `${EMOJI.error} Invalid channel!`); return; }
    const sent = await (channel as any).send({ embeds: [embed], components: rows });
    db.setShopChannel(channel.id);
    db.setSetting('shop_message_id', sent.id);
    send(msg, `${EMOJI.success} Vending machine posted in <#${channel.id}>!`);
  });

  // ── Admin ──
  register('admin', async (msg, args) => {
    if (!isAdmin(msg)) { send(msg, `${EMOJI.error} No permission!`); return; }
    if (args.length < 1) { send(msg, `Usage: \`$admin products|orders|deposit|coupon|analytics ...\``); return; }
    const sub = args[0].toLowerCase();

    if (sub === 'products') {
      if (args[1] === 'list') {
        const prods = db.getAllProducts();
        const cats = db.getCategories();
        send(msg, { embeds: [adminProductListEmbed(prods, cats, botAvatar(msg))] });
      } else if (args[1] === 'add') {
        if (args.length < 6) { send(msg, `Usage: \`$admin products add SLOTID NAME PRICE CATEGORY_ID [stock]\``); return; }
        const slot = args[2].toUpperCase();
        const name = args[3];
        const price = parseFloat(args[4]);
        const catId = parseInt(args[5]);
        const stock = args[6] ? parseInt(args[6]) : -1;
        if (isNaN(price) || isNaN(catId)) { send(msg, `${EMOJI.error} Invalid price or category!`); return; }
        db.addProduct(slot, name, '', price, catId, stock);
        send(msg, `${EMOJI.success} Product \`[${slot}]\` ${name} added!`);
      } else if (args[1] === 'edit') {
        if (args.length < 4) { send(msg, `Usage: \`$admin products edit SLOTID field value\`\nFields: name, price, stock, description, howtouse, active`); return; }
        const slot = args[2].toUpperCase();
        const field = args[3].toLowerCase();
        const val = args.slice(4).join(' ');
        const product = db.getProductBySlot(slot);
        if (!product) { send(msg, `${EMOJI.error} Product not found!`); return; }
        const update: any = {};
        if (field === 'name') update.name = val;
        else if (field === 'price') update.price = parseFloat(val);
        else if (field === 'stock') update.stock = parseInt(val);
        else if (field === 'description') update.description = val;
        else if (field === 'howtouse') update.how_to_use = val;
        else if (field === 'active') update.is_active = val === 'true' || val === '1';
        else { send(msg, `${EMOJI.error} Unknown field!`); return; }
        db.editProduct(slot, update);
        send(msg, `${EMOJI.success} Product \`[${slot}]\` updated!`);
      } else if (args[1] === 'remove') {
        if (args.length < 3) { send(msg, `Usage: \`$admin products remove SLOTID\``); return; }
        const slot = args[2].toUpperCase();
        db.removeProduct(slot);
        send(msg, `${EMOJI.success} Product \`[${slot}]\` removed!`);
      } else {
        send(msg, `Usage: \`$admin products list|add|edit|remove\``);
      }
    } else if (sub === 'orders') {
      if (args[1] === 'list') {
        const status = args[2];
        const orders = db.getAllOrders(status);
        if (orders.length === 0) { send(msg, `${EMOJI.warning} No orders found.`); return; }
        let desc = '';
        for (const o of orders) {
          desc += `\`${o.id.slice(0, 8)}\` <@${o.user_id}> • ${formatCurrency(o.total_amount)} • \`${o.status}\`\n`;
        }
        send(msg, { embeds: [new EmbedBuilder().setColor(COLORS.gold).setTitle(`${EMOJI.invoice} Orders`).setDescription(desc)] });
      } else if (args[1] === 'view') {
        if (args.length < 3) { send(msg, `Usage: \`$admin orders view ORDER_ID\``); return; }
        const order = db.getOrder(args[2]);
        if (!order) { send(msg, `${EMOJI.error} Order not found!`); return; }
        const items = db.getOrderItems(args[2]);
        send(msg, orderEmbed(order, items, botAvatar(msg)));
      } else {
        send(msg, `Usage: \`$admin orders list|view\``);
      }
    } else if (sub === 'deposit') {
      if (args.length < 3) { send(msg, `Usage: \`$admin deposit @user AMOUNT\``); return; }
      const targetId = args[1].replace(/[<@!>]/g, '');
      const amount = parseFloat(args[2]);
      if (isNaN(amount) || amount <= 0) { send(msg, `${EMOJI.error} Invalid amount!`); return; }
      db.ensureUser(targetId);
      db.updateBalance(targetId, amount);
      send(msg, `${EMOJI.success} ${formatCurrency(amount)} added to <@${targetId}>!`);
    } else if (sub === 'coupon') {
      if (args.length < 3) { send(msg, `Usage: \`$admin coupon CODE DISCOUNT% [minPurchase] [maxUses]\``); return; }
      const code = args[1].toUpperCase();
      const discount = parseInt(args[2]);
      const minPurchase = args[3] ? parseFloat(args[3]) : 0;
      const maxUses = args[4] ? parseInt(args[4]) : 0;
      if (isNaN(discount) || discount < 1 || discount > 100) { send(msg, `${EMOJI.error} Discount must be 1-100!`); return; }
      db.createCoupon(code, discount, minPurchase, maxUses);
      send(msg, `${EMOJI.success} Coupon \`${code}\` created (${discount}% off)!`);
    } else if (sub === 'analytics') {
      const revenue = db.getTotalRevenue();
      const orderCount = db.getOrderCount();
      const top = db.getTopProducts();
      let desc = `**Revenue:** ${formatCurrency(revenue)}\n**Orders:** ${orderCount}\n\n**Top Products:**\n`;
      for (const p of top) {
        desc += `• **${p.name}** — ${formatCurrency(p.total)} (${p.count} sold)\n`;
      }
      send(msg, { embeds: [new EmbedBuilder().setColor(COLORS.gold).setTitle(`${EMOJI.analytics} Analytics`).setDescription(desc)] });
    } else {
      send(msg, `Usage: \`$admin products|orders|deposit|coupon|analytics\``);
    }
  });

  // ── Restock ──
  register('restock', (msg, args) => {
    if (!isRestocker(msg)) { send(msg, `${EMOJI.error} No permission!`); return; }
    if (args.length < 2) { send(msg, `Usage: \`$restock SLOT_ID AMOUNT\``); return; }
    const slot = args[0].toUpperCase();
    const amount = parseInt(args[1]);
    if (isNaN(amount) || amount < -1) { send(msg, `${EMOJI.error} Invalid amount! (-1 for unlimited)`); return; }
    const product = db.getProductBySlot(slot);
    if (!product) { send(msg, `${EMOJI.error} Product not found!`); return; }
    db.setProductStock(product.id, amount);
    send(msg, `${EMOJI.success} \`[${slot}]\` stock set to ${amount === -1 ? 'unlimited' : amount}!`);
  });

  // ── Stock (Inventory Codes) ──
  register('stock', (msg, args) => {
    if (!isRestocker(msg)) { send(msg, `${EMOJI.error} No permission!`); return; }
    if (args.length < 2) { send(msg, `Usage: \`$stock SLOT_ID add|bulk|list [codes...]\``); return; }
    const slot = args[0].toUpperCase();
    const action = args[1].toLowerCase();
    const product = db.getProductBySlot(slot);
    if (!product) { send(msg, `${EMOJI.error} Product \`[${slot}]\` not found!`); return; }

    if (action === 'add') {
      if (args.length < 3) { send(msg, `Usage: \`$stock SLOT_ID add CODE\``); return; }
      const code = args.slice(2).join(' ');
      db.addInventoryCode(product.id, code);
      const cnt = db.getInventoryCount(product.id);
      send(msg, `${EMOJI.success} Code added to **${product.name}** — ${cnt.available} available, ${cnt.sold} sold`);
    } else if (action === 'bulk') {
      if (args.length < 3) { send(msg, `Usage: \`$stock SLOT_ID bulk <code1> <code2> ...\``); return; }
      const codes = args.slice(2);
      const added = db.addInventoryCodesBulk(product.id, codes);
      const cnt = db.getInventoryCount(product.id);
      send(msg, `${EMOJI.success} ${added} codes added to **${product.name}** — ${cnt.available} available, ${cnt.sold} sold`);
    } else if (action === 'list') {
      const items = db.listInventoryCodes(product.id);
      if (items.length === 0) { send(msg, `${EMOJI.warning} No codes for **${product.name}**`); return; }
      const cnt = db.getInventoryCount(product.id);
      let desc = '';
      for (const item of items) {
        const status = item.is_sold ? 'Sold' : 'Available';
        const line = `\`${item.code}\` — ${status}\n`;
        if (desc.length + line.length > 1900) { desc += '\n...and more'; break; }
        desc += line;
      }
      send(msg, {
        embeds: [new EmbedBuilder()
          .setColor(COLORS.gold)
          .setTitle(`\`[${slot}]\` ${product.name}`)
          .setDescription(desc)
          .setFooter({ text: `${cnt.available} available, ${cnt.sold} sold` })
        ]
      });
    } else {
      send(msg, `Usage: \`$stock SLOT_ID add|bulk|list\``);
    }
  });

  // ── Deposit (Wallet Admin) ──
  register('deposit', (msg, args) => {
    if (!isWalletAdmin(msg)) { send(msg, `${EMOJI.error} No permission!`); return; }
    if (args.length < 2) { send(msg, `Usage: \`$deposit @user AMOUNT\``); return; }
    const targetId = args[0].replace(/[<@!>]/g, '');
    const amount = parseFloat(args[1]);
    if (isNaN(amount) || amount <= 0) { send(msg, `${EMOJI.error} Invalid amount!`); return; }
    db.ensureUser(targetId);
    db.updateBalance(targetId, amount);
    send(msg, `${EMOJI.success} ${formatCurrency(amount)} deposited to <@${targetId}>!`);
  });

  // ── Deliver (Manual) ──
  register('deliver', (msg, args) => {
    if (!isAdmin(msg)) { send(msg, `${EMOJI.error} No permission!`); return; }
    if (args.length < 2) { send(msg, `Usage: \`$deliver ORDER_ID CODE\``); return; }
    const orderId = args[0];
    const code = args.slice(1).join(' ');
    const order = db.getOrder(orderId);
    if (!order) { send(msg, `${EMOJI.error} Order not found!`); return; }
    const items = db.getOrderItems(orderId);
    const pendingItem = items.find(i => i.delivery_status === 'pending');
    if (!pendingItem) { send(msg, `${EMOJI.error} No pending item in this order!`); return; }
    db.updateDeliveryMessage(pendingItem.id, code);
    msg.guild?.members.fetch(order.user_id).then(member => {
      const updatedItems = db.getOrderItems(orderId);
      member.send({ embeds: [deliveryEmbed(updatedItems, botAvatar(msg))] }).catch(() => {});
    }).catch(() => {});
    send(msg, `${EMOJI.success} Code delivered to order \`${orderId.slice(0, 8)}\`!`);
  });

  // ── Restocker Manage ──
  register('restocker', (msg, args) => {
    if (!isAdmin(msg)) { send(msg, `${EMOJI.error} No permission!`); return; }
    if (args.length < 2) { send(msg, `Usage: \`$restocker add|remove @user\``); return; }
    const action = args[0].toLowerCase();
    const targetId = args[1].replace(/[<@!>]/g, '');
    if (action === 'add') {
      db.setUserPermission(targetId, 'restocker', true);
      send(msg, `${EMOJI.success} <@${targetId}> is now a **Restocker**!`);
    } else if (action === 'remove') {
      db.setUserPermission(targetId, 'restocker', false);
      send(msg, `${EMOJI.success} Removed **Restocker** from <@${targetId}>`);
    } else {
      send(msg, `Usage: \`$restocker add|remove @user\``);
    }
  });

  // ── Wallet Admin Manage ──
  register('walletadmin', (msg, args) => {
    if (!isAdmin(msg)) { send(msg, `${EMOJI.error} No permission!`); return; }
    if (args.length < 2) { send(msg, `Usage: \`$walletadmin add|remove @user\``); return; }
    const action = args[0].toLowerCase();
    const targetId = args[1].replace(/[<@!>]/g, '');
    if (action === 'add') {
      db.setUserPermission(targetId, 'wallet_admin', true);
      send(msg, `${EMOJI.success} <@${targetId}> is now a **Wallet Admin**!`);
    } else if (action === 'remove') {
      db.setUserPermission(targetId, 'wallet_admin', false);
      send(msg, `${EMOJI.success} Removed **Wallet Admin** from <@${targetId}>`);
    } else {
      send(msg, `Usage: \`$walletadmin add|remove @user\``);
    }
  });
}
