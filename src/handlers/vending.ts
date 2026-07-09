import { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ComponentType, Interaction } from 'discord.js';
import { EMOJI } from '../config.js';
import { formatCurrency, generateOrderId } from '../utils.js';
import { vendingMachineEmbed, productDetailEmbed, cartEmbed, deliveryEmbed, orderEmbed } from '../embeds.js';
import * as db from '../database.js';
import type { Category, Product } from '../types.js';

// Store pending direct-buy product info (userId -> productId)
const pendingDirectBuys = new Map<string, number>();

export function getPendingDirectBuy(userId: string): number | undefined {
  const id = pendingDirectBuys.get(userId);
  pendingDirectBuys.delete(userId);
  return id;
}

export function vendingMachineRows(cats: Category[], products: Product[]): ActionRowBuilder<any>[] {
  const rows: ActionRowBuilder<any>[] = [];

  // Category selector
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('select_category')
    .setPlaceholder('Browse categories...')
    .addOptions(
      cats.map(cat =>
        new StringSelectMenuOptionBuilder()
          .setLabel(cat.name)
          .setValue(String(cat.id))
          .setDescription(cat.description)
          .setEmoji(cat.emoji)
      )
    );

  rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu));

  // Product slot buttons (max 5 per row, 25 max)
  const buttons = products.slice(0, 25).map(p =>
    new ButtonBuilder()
      .setCustomId(`slot_${p.slot_id}`)
      .setLabel(p.slot_id)
      .setStyle(ButtonStyle.Secondary)
  );

  // Split into rows of 5
  for (let i = 0; i < buttons.length; i += 5) {
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(buttons.slice(i, i + 5)));
  }

  // Nav buttons
  rows.push(
    new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder().setCustomId('view_cart').setEmoji('\u{1F6D2}').setLabel('Cart').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('refresh_shop').setEmoji('\u{1F504}').setLabel('Refresh').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('back_to_shop').setEmoji('\u{1F3EA}').setLabel('Shop').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('cart_checkout').setEmoji('\u{2705}').setLabel('Checkout').setStyle(ButtonStyle.Success)
      )
  );

  return rows;
}

export async function handleCategorySelect(interaction: any) {
  await interaction.deferUpdate();
  const catId = parseInt(interaction.values[0]);
  const cat = db.getCategory(catId);
  if (!cat) return;
  const products = db.getProductsByCategory(catId);
  const bal = db.getUserBalance(interaction.user.id);
  const embed = vendingMachineEmbed(cat, products, bal);
  const rows = vendingMachineRows(db.getCategories(), products);
  await interaction.editReply({ embeds: [embed], components: rows });
}

export async function handleSlotButton(interaction: any, slotId: string) {
  const product = db.getProductBySlot(slotId);
  if (!product) {
    await interaction.reply({ content: `${EMOJI.error} Product not found!`, ephemeral: true });
    return;
  }

  const bal = db.getUserBalance(interaction.user.id);
  const embed = productDetailEmbed(product, bal);

  const row = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder().setCustomId(`buy_${product.id}`).setEmoji('\u{1F6D2}').setLabel('Add to Cart').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`wish_${product.id}`).setEmoji('\u{1F497}').setLabel('Wishlist').setStyle(ButtonStyle.Secondary)
    );

  await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
}

export async function handleBuyButton(interaction: any, productId: number) {
  db.ensureUser(interaction.user.id);
  const product = db.getProductById(productId);
  if (!product) {
    await interaction.reply({ content: `${EMOJI.error} Product not found!`, ephemeral: true });
    return;
  }

  // Check if product uses inventory codes
  const cnt = db.getInventoryCount(productId);

  if (cnt.available > 0) {
    // Store for modal handler
    pendingDirectBuys.set(interaction.user.id, productId);

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
  } else if (product.stock !== -1 && product.stock <= 0) {
    await interaction.reply({ content: `${EMOJI.error} ${product.name} is sold out!`, ephemeral: true });
    return;
  } else {
    // Manual stock - simple add to cart
    db.addToCart(interaction.user.id, productId, 1);
    await interaction.reply({ content: `${EMOJI.cart} **${product.name}** added to cart!`, ephemeral: true });
  }
}

export async function handleWishlistButton(interaction: any, productId: number) {
  db.ensureUser(interaction.user.id);
  const product = db.getProductById(productId);
  if (!product) {
    await interaction.reply({ content: `${EMOJI.error} Product not found!`, ephemeral: true });
    return;
  }
  db.addToWishlist(interaction.user.id, productId);
  await interaction.reply({ content: `${EMOJI.wishlist} **${product.name}** added to wishlist!`, ephemeral: true });
}

export async function handleViewCart(interaction: any) {
  db.ensureUser(interaction.user.id);
  const items = db.getCart(interaction.user.id);
  const total = db.getCartTotal(interaction.user.id);
  await interaction.reply({ embeds: [cartEmbed(items, total)], ephemeral: true });
}

export async function handleCartCheckout(interaction: any) {
  db.ensureUser(interaction.user.id);
  const items = db.getCart(interaction.user.id);
  if (items.length === 0) {
    await interaction.reply({ content: `${EMOJI.warning} Your cart is empty!`, ephemeral: true });
    return;
  }

  // Show checkout modal for coupon
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

export async function handleBackToShop(interaction: any) {
  await interaction.deferUpdate();
  const cats = db.getCategories();
  if (cats.length === 0) {
    await interaction.editReply({ content: `${EMOJI.error} No categories!`, components: [] });
    return;
  }
  const products = db.getProductsByCategory(cats[0].id);
  const bal = db.getUserBalance(interaction.user.id);
  const embed = vendingMachineEmbed(cats[0], products, bal);
  const rows = vendingMachineRows(cats, products);
  await interaction.editReply({ embeds: [embed], components: rows });
}

export async function handleRefreshShop(interaction: any) {
  await interaction.deferUpdate();
  const cats = db.getCategories();
  if (cats.length === 0) return;
  // Find current category from embed
  let catId = cats[0].id;
  const embed = interaction.message.embeds[0];
  if (embed && embed.title) {
    // Try to determine current category (simple approach: use first)
  }
  const products = db.getProductsByCategory(catId);
  const bal = db.getUserBalance(interaction.user.id);
  const embedUpdated = vendingMachineEmbed(cats[0], products, bal);
  const rows = vendingMachineRows(cats, products);
  await interaction.editReply({ embeds: [embedUpdated], components: rows });
}

export async function handleCartClear(interaction: any) {
  db.ensureUser(interaction.user.id);
  db.clearCart(interaction.user.id);
  await interaction.reply({ content: `${EMOJI.success} Cart cleared!`, ephemeral: true });
}
