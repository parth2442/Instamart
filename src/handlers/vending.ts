import { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ComponentType, Interaction, MessageFlags } from 'discord.js';
import { EMOJI } from '../config.js';
import { formatCurrency, generateOrderId } from '../utils.js';
import { vendingMachineEmbed, productDetailEmbed, cartEmbed, deliveryEmbed, orderEmbed } from '../embeds.js';
import * as db from '../database.js';
import * as res from '../response.js';
import type { Category, Product } from '../types.js';

const pendingDirectBuys = new Map<string, { productId: number; createdAt: number }>();

export function getPendingDirectBuy(userId: string): number | undefined {
  const entry = pendingDirectBuys.get(userId);
  pendingDirectBuys.delete(userId);
  return entry?.productId;
}

// Cleanup stale direct buy sessions every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [userId, entry] of pendingDirectBuys) {
    if (now - entry.createdAt > 10 * 60 * 1000) {
      pendingDirectBuys.delete(userId);
    }
  }
}, 5 * 60 * 1000);

export function vendingMachineRows(cats: Category[], products: Product[], invMap?: Map<number, { available: number; sold: number }>): ActionRowBuilder<any>[] {
  const rows: ActionRowBuilder<any>[] = [];

  const safeCats = cats.filter(c => c.name && c.name.length >= 1 && c.name.length <= 100);
  if (safeCats.length > 0) {
    rows.push(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('select_category')
          .setPlaceholder('📂 Browse categories…')
          .addOptions(
            safeCats.slice(0, 25).map(cat => {
              const opt = new StringSelectMenuOptionBuilder()
                .setLabel(cat.name.slice(0, 100))
                .setValue(String(cat.id));
              if (cat.description) opt.setDescription(cat.description.slice(0, 100));
              if (cat.emoji && cat.emoji.length > 0) {
                try { opt.setEmoji(cat.emoji); } catch {}
              }
              return opt;
            })
          )
      )
    );
  }

  // Group slot buttons by row letter — just like a real vending keypad
  const grouped = new Map<string, Product[]>();
  for (const p of products.slice(0, 25)) {
    const key = p.slot_id ? p.slot_id.charAt(0).toUpperCase() : '?';
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(p);
  }

  const MB_EMOJI = '\u{1F3E6}';
  const ROW_STYLES = [ButtonStyle.Primary, ButtonStyle.Success, ButtonStyle.Primary, ButtonStyle.Success];
  let styleIdx = 0;
  for (const [_, prods] of grouped) {
    const rowStyle = ROW_STYLES[styleIdx++ % ROW_STYLES.length];
    const btns = prods.map(p => {
      const cnt = invMap?.get(p.id);
      const available = cnt ? cnt.available : 0;
      const isOut = available === 0;
      const style = isOut ? ButtonStyle.Danger : rowStyle;
      const customId = 'slot_' + p.id;
      return new ButtonBuilder()
        .setCustomId(customId)
        .setLabel((p.slot_id || '???').slice(0, 80))
        .setEmoji(MB_EMOJI)
        .setStyle(style)
        .setDisabled(isOut);
    });
    for (let i = 0; i < btns.length; i += 5) {
      rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(btns.slice(i, i + 5)));
    }
  }

  rows.push(
    new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder().setCustomId('view_cart').setEmoji('🛒').setLabel('Cart').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('refresh_shop').setEmoji('🔄').setLabel('Refresh').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('back_to_shop').setEmoji('🏪').setLabel('Shop').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('cart_checkout').setEmoji('✅').setLabel('Checkout').setStyle(ButtonStyle.Success)
      )
  );

  return rows;
}

function getBotAvatar(interaction: any): string | undefined {
  return interaction.client?.user?.displayAvatarURL({ forceStatic: false, size: 256 });
}

export async function handleCategorySelect(interaction: any) {
  await interaction.deferUpdate();
  const catId = parseInt(interaction.values[0]);
  const cat = await db.getCategory(catId);
  if (!cat) return;
  const products = await db.getProductsByCategory(catId);
  const invMap = await buildInvMap(products);
  const bal = await db.getUserBalance(interaction.user.id);
  const View = vendingMachineEmbed(cat, products, bal, getBotAvatar(interaction), invMap);
  const rows = vendingMachineRows(await db.getCategories(), products, invMap);
  await interaction.editReply({ flags: MessageFlags.IsComponentsV2, embeds: [], components: [View, ...rows] });
}

export async function handleSlotButton(interaction: any, productId: number) {
  const product = await db.getProductById(productId);
  if (!product) {
    await interaction.reply({ flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral, components: [res.error('Product not found!')] });
    return;
  }

  const bal = await db.getUserBalance(interaction.user.id);
  const View = productDetailEmbed(product, bal, getBotAvatar(interaction));

  const row = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder().setCustomId(`buy_${product.id}`).setEmoji('\u{1F6D2}').setLabel('Add to Cart').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`wish_${product.id}`).setEmoji('\u{1F497}').setLabel('Wishlist').setStyle(ButtonStyle.Secondary)
    );

  await interaction.reply({ flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral, components: [View, row] });
}

export async function handleBuyButton(interaction: any, productId: number) {
  await db.ensureUser(interaction.user.id);
  const product = await db.getProductById(productId);
  if (!product) {
    await interaction.reply({ flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral, components: [res.error('Product not found!')] });
    return;
  }

  const cnt = await db.getInventoryCount(productId);

  if (cnt.available > 0) {
    pendingDirectBuys.set(interaction.user.id, { productId, createdAt: Date.now() });

    const modal = new ModalBuilder()
      .setCustomId('checkout_modal')
      .setTitle(`Buy ${product.name}`)
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>()
          .addComponents(
            new TextInputBuilder()
              .setCustomId('coupon_code')
              .setLabel('Coupon Code (optional)')
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
              .setPlaceholder('Enter coupon or leave blank')
          )
      );

    await interaction.showModal(modal);
  } else if (product.stock === -1) {
    await interaction.reply({ flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral, components: [res.error(`${product.name} has no available codes right now.`)] });
    return;
  } else if (cnt.available === 0 && product.stock <= 0) {
    await interaction.reply({ flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral, components: [res.error(`${product.name} is sold out!`)] });
    return;
  } else {
    await db.addToCart(interaction.user.id, productId, 1);
    await interaction.reply({ flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral, components: [res.info(`**${product.name}** added to cart!`, EMOJI.cart)] });
  }
}

export async function handleWishlistButton(interaction: any, productId: number) {
  await db.ensureUser(interaction.user.id);
  const product = await db.getProductById(productId);
  if (!product) {
    await interaction.reply({ flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral, components: [res.error('Product not found!')] });
    return;
  }
  await db.addToWishlist(interaction.user.id, productId);
  await interaction.reply({ flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral, components: [res.info(`**${product.name}** added to wishlist!`, EMOJI.wishlist)] });
}

export async function handleViewCart(interaction: any) {
  await db.ensureUser(interaction.user.id);
  const items = await db.getCart(interaction.user.id);
  const total = await db.getCartTotal(interaction.user.id);
  await interaction.reply({ flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral, components: [cartEmbed(items, total, getBotAvatar(interaction))] });
}

export async function handleCartCheckout(interaction: any) {
  await db.ensureUser(interaction.user.id);
  const items = await db.getCart(interaction.user.id);
  if (items.length === 0) {
    await interaction.reply({ flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral, components: [res.warning('Your cart is empty!')] });
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId('checkout_modal')
    .setTitle('Checkout')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>()
        .addComponents(
          new TextInputBuilder()
            .setCustomId('coupon_code')
            .setLabel('Coupon Code (optional)')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setPlaceholder('Enter coupon or leave blank')
        )
    );

  await interaction.showModal(modal);
}

export async function buildInvMap(products: any[]): Promise<Map<number, { available: number; sold: number }>> {
  const map = new Map<number, { available: number; sold: number }>();
  for (const p of products) {
    const cnt = await db.getInventoryCount(p.id);
    map.set(p.id, cnt);
  }
  return map;
}

export async function handleBackToShop(interaction: any) {
  await interaction.deferUpdate();
  const cats = await db.getCategories();
  if (cats.length === 0) {
    await interaction.editReply({ flags: MessageFlags.IsComponentsV2, embeds: [], components: [res.error('No categories!')] });
    return;
  }
  const products = await db.getProductsByCategory(cats[0].id);
  const invMap = await buildInvMap(products);
  const bal = await db.getUserBalance(interaction.user.id);
  const View = vendingMachineEmbed(cats[0], products, bal, getBotAvatar(interaction), invMap);
  const rows = vendingMachineRows(cats, products, invMap);
  await interaction.editReply({ flags: MessageFlags.IsComponentsV2, embeds: [], components: [View, ...rows] });
}

export async function handleRefreshShop(interaction: any) {
  await interaction.deferUpdate();
  const cats = await db.getCategories();
  if (cats.length === 0) return;
  let catId = cats[0].id;
  const products = await db.getProductsByCategory(catId);
  const invMap = await buildInvMap(products);
  const bal = await db.getUserBalance(interaction.user.id);
  const ViewUpdated = vendingMachineEmbed(cats[0], products, bal, getBotAvatar(interaction), invMap);
  const rows = vendingMachineRows(cats, products, invMap);
  await interaction.editReply({ flags: MessageFlags.IsComponentsV2, embeds: [], components: [ViewUpdated, ...rows] });
}

export async function handleCartClear(interaction: any) {
  await db.ensureUser(interaction.user.id);
  await db.clearCart(interaction.user.id);
  await interaction.reply({ flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral, components: [res.success('Cart cleared!')] });
}

// ─── Update Vending Panel After Purchase ───

export async function updateVendingPanel(client: any) {
  try {
    const channelId = await db.getShopChannel();
    const msgId = await db.getSetting('shop_message_id');
    if (!channelId || !msgId) return;

    const channel = client.channels.cache.get(channelId);
    if (!channel) return;
    const msg = await channel.messages.fetch(msgId).catch(() => null);
    if (!msg) return;

    const cats = await db.getCategories();
    if (cats.length === 0) return;
    const products = await db.getProductsByCategory(cats[0].id);
    const invMap = await buildInvMap(products);
    const bal = 0;
    const View = vendingMachineEmbed(cats[0], products, bal, client.user?.displayAvatarURL({ forceStatic: false, size: 256 }), invMap);
    const rows = vendingMachineRows(cats, products, invMap);
    await msg.edit({ flags: MessageFlags.IsComponentsV2, embeds: [], components: [View, ...rows] });
  } catch {}
}
