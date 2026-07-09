import { EmbedBuilder } from 'discord.js';
import { COLORS, EMOJI } from './config.js';
import { formatCurrency } from './utils.js';
import type { Category, Product, CartItem, Order, OrderItem, InventoryItem } from './types.js';
import { getProductById, getInventoryCount } from './database.js';

const FOOTER_TEXT = 'Designed by parth.cd';

export function vendingMachineEmbed(cat: Category, products: Product[], balance: number, botAvatar?: string): EmbedBuilder {
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

  const embed = new EmbedBuilder()
    .setColor(COLORS.gold)
    .setTitle(`INSTAMART ${EMOJI.vending}`)
    .setDescription(desc)
    .setFooter({ text: `Balance: ${formatCurrency(balance)} • ${FOOTER_TEXT}` });
  if (botAvatar) embed.setThumbnail(botAvatar);
  return embed;
}

export function productDetailEmbed(product: Product, userBalance: number, botAvatar?: string): EmbedBuilder {
  const stockStr = product.stock >= 0 ? `${product.stock}` : 'Unlimited';
  const desc = product.description || `Premium ${product.name}`;
  const embed = new EmbedBuilder()
    .setColor(COLORS.gold)
    .setTitle(`\`[${product.slot_id}]\` ${product.name}`)
    .setDescription(desc)
    .addFields(
      { name: 'Price', value: formatCurrency(product.price), inline: true },
      { name: 'Stock', value: stockStr, inline: true },
      { name: 'Balance', value: formatCurrency(userBalance), inline: true }
    )
    .setFooter({ text: FOOTER_TEXT });
  if (botAvatar) embed.setThumbnail(botAvatar);
  return embed;
}

export function cartEmbed(items: CartItem[], total: number, botAvatar?: string): EmbedBuilder {
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
  const embed = new EmbedBuilder()
    .setColor(COLORS.gold)
    .setTitle(`${EMOJI.cart} Cart`)
    .setDescription(desc)
    .addFields({ name: '\u200B', value: `**Total:** ${formatCurrency(total)}`, inline: false })
    .setFooter({ text: `Checkout or keep browsing • ${FOOTER_TEXT}` });
  if (botAvatar) embed.setThumbnail(botAvatar);
  return embed;
}

export function balanceEmbed(userId: string, balance: number, totalSpent: number, botAvatar?: string): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(COLORS.gold)
    .setTitle(`${EMOJI.coin} Wallet`)
    .addFields(
      { name: 'Balance', value: formatCurrency(balance), inline: true },
      { name: 'Total Spent', value: formatCurrency(totalSpent), inline: true }
    )
    .setFooter({ text: FOOTER_TEXT });
  if (botAvatar) embed.setThumbnail(botAvatar);
  return embed;
}

export function orderEmbed(order: Order, items: OrderItem[], botAvatar?: string): EmbedBuilder {
  let itemLines = '';
  for (const item of items) {
    itemLines += `\`${item.product_name}\` x${item.quantity} ─ ${formatCurrency(item.unit_price * item.quantity)}\n`;
  }
  const embed = new EmbedBuilder()
    .setColor(COLORS.success)
    .setTitle(`${EMOJI.invoice} Order Confirmed`)
    .setDescription(`Order \`${order.id.slice(0, 8)}\``)
    .addFields(
      { name: 'Items', value: itemLines },
      { name: 'Total', value: formatCurrency(order.total_amount), inline: true },
      { name: 'Status', value: `\`${order.status}\``, inline: true }
    )
    .setFooter({ text: FOOTER_TEXT });
  if (botAvatar) embed.setThumbnail(botAvatar);
  return embed;
}

export function deliveryEmbed(items: OrderItem[], botAvatar?: string): EmbedBuilder {
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
  const embed = new EmbedBuilder()
    .setColor(COLORS.success)
    .setTitle(`${EMOJI.pkg} Items Delivered`)
    .setDescription(desc)
    .setFooter({ text: FOOTER_TEXT });
  if (botAvatar) embed.setThumbnail(botAvatar);
  return embed;
}

export function helpEmbed(botAvatar?: string): EmbedBuilder {
  const bt = '`';

  const walletSection =
    `${EMOJI.coin} **Wallet**\n` +
    `${bt}$balance${bt} Check your balance\n` +
    `${bt}$give${bt} <amount> @user Send coins\n` +
    `${bt}$cart${bt} View cart\n` +
    `${bt}$history${bt} Order history\n` +
    `${bt}$wishlist${bt} Your wishlist\n\n`;

  const shopSection =
    `${EMOJI.vending} **Shop**\n` +
    `${bt}$postshop${bt} [#channel] Post vending machine\n` +
    `${bt}$stock${bt} SLOT add|bulk|list Manage codes\n` +
    `${bt}$restock${bt} SLOT <amount> Set product stock\n\n`;

  const adminSection = `${EMOJI.settings} **Admin**\n` +
    `${bt}$admin${bt} products|orders|coupon|analytics\n` +
    `${bt}$deposit${bt} @user <amount> Add balance\n` +
    `${bt}$restocker${bt} add|remove @user Manage restockers\n` +
    `${bt}$walletadmin${bt} add|remove @user\n\n`;

  const modSection =
    `${EMOJI.shield} **Moderation**\n` +
    `${bt}$kick${bt} @user [reason]\n` +
    `${bt}$ban${bt} @user [reason]\n` +
    `${bt}$mute${bt} @user <min> [reason]\n` +
    `${bt}$unmute${bt} @user\n` +
    `${bt}$purge${bt} [1-100] Bulk delete\n` +
    `${bt}$slowmode${bt} [0-21600] Set slowmode\n` +
    `${bt}$announce${bt} "title" "msg" [#channel]`;

  const desc = walletSection + shopSection + adminSection + modSection;

  const embed = new EmbedBuilder()
    .setColor(COLORS.gold)
    .setTitle(`InstaMart Help`)
    .setDescription(desc)
    .setFooter({ text: `Prefix: $ • ${FOOTER_TEXT}` });
  if (botAvatar) embed.setThumbnail(botAvatar);
  return embed;
}

export function historyEmbed(orders: Order[], botAvatar?: string): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(COLORS.gold)
    .setTitle(`${EMOJI.invoice} Order History`)
    .setFooter({ text: FOOTER_TEXT });
  if (orders.length === 0) {
    embed.setDescription('No orders yet.');
  } else {
    let desc = '';
    for (const o of orders) {
      desc += `\`${o.id.slice(0, 8)}\` • ${formatCurrency(o.total_amount)} • \`${o.status}\`\n`;
    }
    embed.setDescription(desc);
  }
  if (botAvatar) embed.setThumbnail(botAvatar);
  return embed;
}

export function wishlistEmbed(products: Product[], botAvatar?: string): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(COLORS.gold)
    .setTitle(`${EMOJI.wishlist} Wishlist`)
    .setFooter({ text: FOOTER_TEXT });
  if (products.length === 0) {
    embed.setDescription('Your wishlist is empty!');
  } else {
    let desc = '';
    for (const p of products) {
      desc += `\`[${p.slot_id}]\` **${p.name}** ─ ${formatCurrency(p.price)}\n`;
    }
    embed.setDescription(desc);
  }
  if (botAvatar) embed.setThumbnail(botAvatar);
  return embed;
}

export function adminProductListEmbed(products: Product[], categories: Category[], botAvatar?: string): EmbedBuilder {
  const catMap = new Map(categories.map(c => [c.id, c]));
  let desc = '';
  for (const p of products) {
    const cat = catMap.get(p.category_id);
    const status = p.is_active ? '`ON`' : '`OFF`';
    const stockStr = p.stock >= 0 ? `\`${p.stock}\`` : '`∞`';
    desc += `**\`[${p.slot_id}]\`** ${p.name} ${status}\n${formatCurrency(p.price)} ${stockStr} ${cat?.emoji ?? ''}\n\n`;
  }
  if (!desc) desc = 'No products found.';
  const embed = new EmbedBuilder()
    .setColor(COLORS.warning)
    .setTitle(`${EMOJI.settings} Products List`)
    .setDescription(desc)
    .setFooter({ text: FOOTER_TEXT });
  if (botAvatar) embed.setThumbnail(botAvatar);
  return embed;
}

export function referralEmbed(code: string | null, count: number, botAvatar?: string): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(COLORS.gold)
    .setTitle(`${EMOJI.referral} Referral`)
    .setDescription(code ? `Your code: \`${code}\`\n**${count}** users joined using your link!` : 'Error loading referral code.')
    .setFooter({ text: FOOTER_TEXT });
  if (botAvatar) embed.setThumbnail(botAvatar);
  return embed;
}
