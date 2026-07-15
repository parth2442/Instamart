import { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize } from 'discord.js';
import { COLORS, EMOJI } from './config.js';

function c(): ContainerBuilder { return new ContainerBuilder().setAccentColor(0x000000); }
function t(content: string): TextDisplayBuilder { return new TextDisplayBuilder().setContent(content); }
function s(): SeparatorBuilder { return new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small); }

export function balanceEmbed(userId: string, balance: number, spent: number, avatar?: string): ContainerBuilder {
  return c()
    .addTextDisplayComponents(t(`### \u{1F4B0} Wallet`))
    .addSeparatorComponents(s())
    .addTextDisplayComponents(t(`**Cash:** \`₹${balance.toLocaleString()}\``))
    .addTextDisplayComponents(t(`**Total Spent:** \`₹${spent.toLocaleString()}\``))
    .addSeparatorComponents(s())
    .addTextDisplayComponents(t('-# Crafted by Parth.cd'));
}

export function helpEmbed(cmds: { name: string; desc: string; category: string }[], avatar?: string): ContainerBuilder {
  const cats = [...new Set(cmds.map(c => c.category))];
  const container = c()
    .addTextDisplayComponents(t(`# \u{1F6D2} Mega Bazar`))
    .addSeparatorComponents(s());
  for (const cat of cats) {
    const group = cmds.filter(c => c.category === cat);
    container.addTextDisplayComponents(t(`### ${cat}`));
    for (const cmd of group) {
      container.addTextDisplayComponents(t(`\`${cmd.name}\` ${cmd.desc}`));
    }
    container.addSeparatorComponents(s());
  }
  container.addTextDisplayComponents(t('-# Crafted by Parth.cd'));
  return container;
}

export function historyEmbed(orders: any[], avatar?: string): ContainerBuilder {
  const container = c()
    .addTextDisplayComponents(t(`### \u{1F4CB} Purchase History`))
    .addSeparatorComponents(s());
  if (orders.length === 0) {
    container.addTextDisplayComponents(t('No orders yet.'));
  } else {
    for (const o of orders.slice(0, 10)) {
      container.addTextDisplayComponents(t(`\`${o.id.slice(0, 8)}\` \u{2022} \`₹${o.total_amount.toLocaleString()}\` \u{2022} \`${o.status}\``));
    }
    if (orders.length > 10) container.addTextDisplayComponents(t(`...and ${orders.length - 10} more`));
  }
  container.addSeparatorComponents(s()).addTextDisplayComponents(t('-# Crafted by Parth.cd'));
  return container;
}

export function wishlistEmbed(items: any[], avatar?: string): ContainerBuilder {
  const container = c()
    .addTextDisplayComponents(t(`### \u{2B50} Wishlist`))
    .addSeparatorComponents(s());
  if (items.length === 0) {
    container.addTextDisplayComponents(t('Your wishlist is empty.'));
  } else {
    for (const item of items) {
      container.addTextDisplayComponents(t(`**${item.name}** \u{2014} \`₹${item.price.toLocaleString()}\``));
    }
  }
  container.addSeparatorComponents(s()).addTextDisplayComponents(t('-# Crafted by Parth.cd'));
  return container;
}

export function cartEmbed(items: { product_name?: string; name?: string; product_price?: number; price?: number; quantity?: number; qty?: number }[], total: number, avatar?: string): ContainerBuilder {
  const container = c()
    .addTextDisplayComponents(t(`### \u{1F6D2} Cart`))
    .addSeparatorComponents(s());
  if (items.length === 0) {
    container.addTextDisplayComponents(t('Your cart is empty.'));
  } else {
    for (const item of items) {
      const n = item.product_name || item.name || 'Item';
      const p = item.product_price ?? item.price ?? 0;
      const q = item.quantity ?? item.qty ?? 1;
      container.addTextDisplayComponents(t(`**${n}** x${q} \u{2014} \`₹${(p * q).toLocaleString()}\``));
    }
  }
  container.addSeparatorComponents(s());
  container.addTextDisplayComponents(t(`**Total:** \`₹${total.toLocaleString()}\``));
  container.addSeparatorComponents(s()).addTextDisplayComponents(t('-# Crafted by Parth.cd'));
  return container;
}

export function viewCartEmbed(items: any[], total: number): ContainerBuilder {
  return cartEmbed(items, total);
}

export function referralEmbed(code: string, count: number, avatar?: string): ContainerBuilder {
  return c()
    .addTextDisplayComponents(t(`### \u{1F517} Referral`))
    .addSeparatorComponents(s())
    .addTextDisplayComponents(t(`Your code: \`${code}\``))
    .addTextDisplayComponents(t(`Referrals: **${count}**`))
    .addSeparatorComponents(s())
    .addTextDisplayComponents(t('-# Crafted by Parth.cd'));
}

export function deliveryEmbed(items: any[], avatar?: string): ContainerBuilder {
  const container = c()
    .addTextDisplayComponents(t(`### \u{1F4E6} Delivery`))
    .addSeparatorComponents(s());
  for (const item of items) {
    const status = item.delivery_status === 'delivered' ? '\u{2705}' : '\u{23F3}';
    container.addTextDisplayComponents(t(`${status} **${item.product_name || item.name}**${item.delivery_message ? ': `' + item.delivery_message + '`' : ''}`));
  }
  container.addSeparatorComponents(s()).addTextDisplayComponents(t('-# Crafted by Parth.cd'));
  return container;
}

export function orderEmbed(order: any, items: any[], avatar?: string): ContainerBuilder {
  const container = c()
    .addTextDisplayComponents(t(`### Order \`${order.id.slice(0, 8)}\``))
    .addSeparatorComponents(s())
    .addTextDisplayComponents(t(`**Status:** \`${order.status}\``))
    .addTextDisplayComponents(t(`**Total:** \`₹${order.total_amount.toLocaleString()}\``))
    .addSeparatorComponents(s());
  for (const item of items) {
    const status = item.delivery_status === 'delivered' ? '\u{2705}' : '\u{23F3}';
    container.addTextDisplayComponents(t(`${status} ${item.product_name || item.name}`));
  }
  const discount = order.discount_amount || 0;
  if (discount > 0) {
    container.addSeparatorComponents(s());
    container.addTextDisplayComponents(t(`**Discount:** -\`₹${discount.toLocaleString()}\``));
  }
  container.addSeparatorComponents(s()).addTextDisplayComponents(t('-# Crafted by Parth.cd'));
  return container;
}

export function vendingMachineEmbed(category: any, products: any[], _balance?: number, avatar?: string, invMap?: Map<number, { available: number; sold: number }>): ContainerBuilder {
  const container = new ContainerBuilder().setAccentColor(COLORS.gold)
    .addTextDisplayComponents(t('# \u{1F3E6} MEGA BAZAR'))
    .addSeparatorComponents(s())
    .addTextDisplayComponents(t(`## \u{1F4C1} ${category.name}`));

  if (products.length === 0) {
    container.addSeparatorComponents(s());
    container.addTextDisplayComponents(t('-# No products here yet.'));
  } else {
    container.addSeparatorComponents(s());
    for (const p of products) {
      const price = p.price > 0 ? `₹${p.price.toLocaleString()}` : 'Free';
      container.addTextDisplayComponents(t(`**\`${p.slot_id}\` \u{2192} ${p.name}** \u{2014} ${price}`));
      const cnt = invMap?.get(p.id);
      const available = cnt ? cnt.available : 0;
      const stockStr = cnt && available > 0 ? `\u{1F7E2} ${available} available` : '\u{1F534} Sold out';
      container.addTextDisplayComponents(t(`-# ${stockStr}${p.description ? ' \u{2022} ' + p.description : ''}`));
    }
  }

  container.addSeparatorComponents(s());
  container.addTextDisplayComponents(t('-# Tap a slot below to purchase'));

  return container;
}

export function productDetailEmbed(product: any, balance: number, avatar?: string): ContainerBuilder {
  const container = c()
    .addTextDisplayComponents(t(`# ${product.name}`))
    .addSeparatorComponents(s())
    .addTextDisplayComponents(t(`**Price:** \`${product.price > 0 ? '₹' + product.price.toLocaleString() : 'Free'}\``))
    .addTextDisplayComponents(t(`**Stock:** \`${product.stock === -1 ? '\u{221E}' : product.stock}\``))
    .addTextDisplayComponents(t(`**Your Balance:** \`${balance >= 0 ? '₹' + balance.toLocaleString() : '...'}\``));
  if (product.description) {
    container.addSeparatorComponents(s());
    container.addTextDisplayComponents(t(`### Description`));
    container.addTextDisplayComponents(t(product.description));
  }
  if (product.how_to_use) {
    container.addSeparatorComponents(s());
    container.addTextDisplayComponents(t(`### How to Use`));
    container.addTextDisplayComponents(t(product.how_to_use));
  }
  container.addSeparatorComponents(s()).addTextDisplayComponents(t('-# Crafted by Parth.cd'));
  return container;
}

export function adminProductListEmbed(products: any[], categories: any[], avatar?: string): ContainerBuilder {
  const container = c()
    .addTextDisplayComponents(t(`### \u{1F4CB} All Products`))
    .addSeparatorComponents(s());
  for (const p of products) {
    const cat = categories.find(c => c.id === p.category_id);
    container.addTextDisplayComponents(t(`\`[${p.slot_id}]\` **${p.name}** \u{2014} \`₹${p.price.toLocaleString()}\` ${cat ? '(' + cat.name + ')' : ''} ${p.is_active ? '' : '[\u{1F6AB}]'}`));
  }
  container.addSeparatorComponents(s()).addTextDisplayComponents(t('-# Crafted by Parth.cd'));
  return container;
}
