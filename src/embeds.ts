import { EmbedBuilder } from 'discord.js';
import { COLORS, EMOJI } from './config.js';
import { formatCurrency } from './utils.js';
import type { Category, Product, CartItem, Order, OrderItem, InventoryItem } from './types.js';
import { getProductById, getInventoryCount } from './database.js';

export function vendingMachineEmbed(cat: Category, products: Product[], balance: number): EmbedBuilder {
  const stockIndicator = (stock: number): string => {
    if (stock === 0) return '```diff\n- SOLD OUT\n```';
    if (stock > 0 && stock <= 5) return `\`${stock} left\``;
    if (stock > 0) return `\`${stock} in stock\``;
    return '`unlimited`';
  };

  let desc = `${cat.emoji} ${cat.description}\n\n`;
  for (const p of products) {
    const status = stockIndicator(p.stock);
    const price = formatCurrency(p.price);
    desc += `**\`[${p.slot_id}]\`** ─ **${p.name}**\n${price} ${status}\n\n`;
  }
  desc += `\u200B\n\u{1F53D} *Select a slot below to purchase*`;

  return new EmbedBuilder()
    .setColor(COLORS.gold)
    .setTitle(`${EMOJI.vending}\u202FINSTAMART`)
    .setDescription(desc)
    .setFooter({ text: `Balance: ${formatCurrency(balance)}` });
}

export function productDetailEmbed(product: Product, userBalance: number): EmbedBuilder {
  const stockStr = product.stock >= 0 ? `${product.stock}` : 'Unlimited';
  const desc = product.description || `Premium ${product.name}`;
  return new EmbedBuilder()
    .setColor(COLORS.gold)
    .setTitle(`\`[${product.slot_id}]\` ${product.name}`)
    .setDescription(desc)
    .addFields(
      { name: 'Price', value: formatCurrency(product.price), inline: true },
      { name: 'Stock', value: stockStr, inline: true },
      { name: 'Balance', value: formatCurrency(userBalance), inline: true }
    );
}

export function cartEmbed(items: CartItem[], total: number): EmbedBuilder {
  let desc = '';
  if (items.length === 0) {
    desc = 'Your cart is empty!';
  } else {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const sub = formatCurrency(item.product_price * item.quantity);
      desc += `**\`${i + 1}\`** \`[${item.slot_id}]\` **${item.product_name}** x${item.quantity}\n${sub}\n\n`;
    }
  }
  return new EmbedBuilder()
    .setColor(COLORS.gold)
    .setTitle(`${EMOJI.cart}\u202FCart`)
    .setDescription(desc)
    .addFields({ name: '\u200B', value: `**Total:** ${formatCurrency(total)}`, inline: false })
    .setFooter({ text: 'Checkout or keep browsing' });
}

export function balanceEmbed(userId: string, balance: number, totalSpent: number): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLORS.gold)
    .setTitle(`${EMOJI.coin}\u202FWallet`)
    .addFields(
      { name: 'Balance', value: formatCurrency(balance), inline: true },
      { name: 'Total Spent', value: formatCurrency(totalSpent), inline: true }
    );
}

export function orderEmbed(order: Order, items: OrderItem[]): EmbedBuilder {
  let itemLines = '';
  for (const item of items) {
    itemLines += `\`${item.product_name}\` x${item.quantity} ─ ${formatCurrency(item.unit_price * item.quantity)}\n`;
  }
  return new EmbedBuilder()
    .setColor(COLORS.success)
    .setTitle(`${EMOJI.invoice}\u202FOrder Confirmed`)
    .setDescription(`Order \`${order.id.slice(0, 8)}\``)
    .addFields(
      { name: 'Items', value: itemLines },
      { name: 'Total', value: formatCurrency(order.total_amount), inline: true },
      { name: 'Status', value: `\`${order.status}\``, inline: true }
    );
}

export function deliveryEmbed(items: OrderItem[]): EmbedBuilder {
  let desc = '';
  for (const item of items) {
    const product = getProductById(item.product_id);
    let codeStr = '';
    let howToStr = '';
    if (item.delivery_message) {
      codeStr = `\n**Code:** \`${item.delivery_message}\``;
    }
    if (product?.how_to_use) {
      howToStr = `\n**Redeem:** ${product.how_to_use}`;
    }
    if (item.delivery_status === 'delivered') {
      desc += `━━━━━━━━━━━━\n${EMOJI.success} **${item.product_name}** x${item.quantity}${codeStr}${howToStr}\n`;
    } else {
      desc += `━━━━━━━━━━━━\n${EMOJI.pkg} **${item.product_name}** x${item.quantity} — \`${item.delivery_status}\`${codeStr}${howToStr}\n`;
    }
  }
  return new EmbedBuilder()
    .setColor(COLORS.success)
    .setTitle(`${EMOJI.pkg}\u202FItems Delivered`)
    .setDescription(desc);
}

export function helpEmbed(): EmbedBuilder {
  const bt = '`';
  const desc =
    '━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
    '\u{1F4B0} **Wallet**\n' +
    `${bt}$balance${bt} / ${bt}$bal${bt} Check wallet\n` +
    `${bt}$give${bt} <amount> @user Send coins\n` +
    `${bt}$cart${bt} View cart\n` +
    `${bt}$history${bt} Order history\n` +
    `${bt}$wishlist${bt} Your wishlist\n\n` +
    '━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
    '\u{2699}\u{FE0F} **Admin**\n' +
    `${bt}$postshop${bt} [#channel] Post vending machine\n` +
    `${bt}$restocker${bt} add|remove @user\n` +
    `${bt}$walletadmin${bt} add|remove @user\n` +
    `${bt}$stock${bt} SLOT add|bulk|list Codes\n` +
    `${bt}$restock${bt} SLOT <amount> Set stock\n` +
    `${bt}$deposit${bt} @user <amount> Add balance\n` +
    `${bt}$admin${bt} products|orders|coupon\n\n` +
    '━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
    '\u{1F6E1}\u{FE0F} **Moderation**\n' +
    `${bt}$kick${bt} @user [reason]\n` +
    `${bt}$ban${bt} @user [reason]\n` +
    `${bt}$mute${bt} @user <min> [reason]\n` +
    `${bt}$unmute${bt} @user\n` +
    `${bt}$purge${bt} [1-100]\n` +
    `${bt}$slowmode${bt} [0-21600]\n` +
    `${bt}$announce${bt} "title" "msg" [#channel]`;

  return new EmbedBuilder()
    .setColor(COLORS.gold)
    .setTitle(`${EMOJI.vending}\u202FInstaMart`)
    .setDescription(desc)
    .setFooter({ text: 'Use / for slash commands  •  Prefix: $  •  instamart' });
}

export function historyEmbed(orders: Order[]): EmbedBuilder {
  if (orders.length === 0) {
    return new EmbedBuilder()
      .setColor(COLORS.gold)
      .setTitle(`${EMOJI.invoice}\u202FOrder History`)
      .setDescription('No orders yet.');
  }
  let desc = '';
  for (const o of orders) {
    desc += `\`${o.id.slice(0, 8)}\` • ${formatCurrency(o.total_amount)} • \`${o.status}\`\n`;
  }
  return new EmbedBuilder()
    .setColor(COLORS.gold)
    .setTitle(`${EMOJI.invoice}\u202FOrder History`)
    .setDescription(desc);
}

export function wishlistEmbed(products: Product[]): EmbedBuilder {
  if (products.length === 0) {
    return new EmbedBuilder()
      .setColor(COLORS.gold)
      .setTitle(`${EMOJI.wishlist}\u202FWishlist`)
      .setDescription('Your wishlist is empty!');
  }
  let desc = '';
  for (const p of products) {
    desc += `\`[${p.slot_id}]\` **${p.name}** ─ ${formatCurrency(p.price)}\n`;
  }
  return new EmbedBuilder()
    .setColor(COLORS.gold)
    .setTitle(`${EMOJI.wishlist}\u202FWishlist`)
    .setDescription(desc);
}

export function adminProductListEmbed(products: Product[], categories: Category[]): EmbedBuilder {
  const catMap = new Map(categories.map(c => [c.id, c]));
  let desc = '';
  for (const p of products) {
    const cat = catMap.get(p.category_id);
    const status = p.is_active ? '`ON`' : '`OFF`';
    const stockStr = p.stock >= 0 ? `\`${p.stock}\`` : '`∞`';
    desc += `**\`[${p.slot_id}]\`** ${p.name} ${status}\n${formatCurrency(p.price)} ${stockStr} ${cat?.emoji ?? ''}\n\n`;
  }
  if (!desc) desc = 'No products found.';
  return new EmbedBuilder()
    .setColor(COLORS.warning)
    .setTitle(`${EMOJI.settings}\u202FProducts List`)
    .setDescription(desc);
}

export function referralEmbed(code: string | null, count: number): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLORS.gold)
    .setTitle(`${EMOJI.referral}\u202FReferral`)
    .setDescription(code ? `Your code: \`${code}\`\n**${count}** users joined using your link!` : 'Error loading referral code.');
}
