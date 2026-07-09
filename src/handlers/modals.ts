import { EMOJI } from '../config.js';
import { formatCurrency, generateOrderId } from '../utils.js';
import { deliveryEmbed, orderEmbed } from '../embeds.js';
import * as db from '../database.js';
import { getPendingDirectBuy } from './vending.js';

export async function handleCheckoutModal(interaction: any) {
  await interaction.deferReply({ ephemeral: true });

  db.ensureUser(interaction.user.id);
  const couponCode = interaction.fields.getTextInputValue('coupon_code')?.trim().toUpperCase();

  // Check if this is a direct buy (single product) or cart checkout
  const directBuyProductId = getPendingDirectBuy(interaction.user.id);
  let items: any[];

  if (directBuyProductId) {
    // Direct buy from slot button
    const product = db.getProductById(directBuyProductId);
    if (!product) {
      await interaction.editReply({ content: `${EMOJI.error} Product not found!` });
      return;
    }
    // Create a fake cart item for processing
    items = [{
      product_id: product.id,
      product_name: product.name,
      quantity: 1,
      product_price: product.price,
      slot_id: product.slot_id,
    }];
  } else {
    // Cart checkout
    items = db.getCart(interaction.user.id);
  }

  if (items.length === 0) {
    await interaction.editReply({ content: `${EMOJI.warning} Nothing to checkout!` });
    return;
  }

  let total = items.reduce((sum: number, item: any) => sum + item.product_price * item.quantity, 0);
  let discount = 0;
  let couponUsed: any = null;

  // Apply coupon
  if (couponCode) {
    couponUsed = db.getCoupon(couponCode);
    if (!couponUsed) {
      await interaction.editReply({ content: `${EMOJI.error} Invalid coupon code!` });
      return;
    }
    if (couponUsed.max_uses > 0 && couponUsed.used_count >= couponUsed.max_uses) {
      await interaction.editReply({ content: `${EMOJI.error} Coupon has reached max uses!` });
      return;
    }
    if (total < couponUsed.min_purchase) {
      await interaction.editReply({ content: `${EMOJI.error} Minimum purchase of ${formatCurrency(couponUsed.min_purchase)} required!` });
      return;
    }
    discount = Math.round(total * couponUsed.discount_percent) / 100;
    total = Math.max(0, total - discount);
    db.useCoupon(couponUsed.id);
  }

  // Check balance
  const bal = db.getUserBalance(interaction.user.id);
  if (bal < total) {
    await interaction.editReply({ content: `${EMOJI.error} Insufficient balance! You need ${formatCurrency(total)} but have ${formatCurrency(bal)}` });
    return;
  }

  // Create order
  const orderId = generateOrderId();
  db.createOrder(orderId, interaction.user.id, total);
  db.updateBalance(interaction.user.id, -total);
  db.updateTotalSpent(interaction.user.id, total);

  let allAutoDelivered = true;

  for (const item of items) {
    const product = db.getProductById(item.product_id);
    if (!product) continue;

    db.addOrderItem(orderId, product.id, product.name, item.quantity, product.price);

    const invItem = db.getAvailableCode(product.id);
    if (invItem) {
      db.markCodeSold(invItem.id, orderId, interaction.user.id);
      const orderItems = db.getOrderItems(orderId);
      const lastItem = orderItems[orderItems.length - 1];
      db.updateDeliveryMessage(lastItem.id, invItem.code);
    } else {
      allAutoDelivered = false;
    }
  }

  // Clear cart if it was a cart checkout
  if (!directBuyProductId) {
    db.clearCart(interaction.user.id);
  }

  let desc = `${EMOJI.success} Order placed!\n**Order ID:** \`${orderId.slice(0, 8)}\`\n**Total Charged:** ${formatCurrency(total)}`;
  if (discount > 0) {
    desc += `\n**Discount:** -${formatCurrency(discount)} (${couponUsed?.discount_percent ?? 0}% off)`;
  }

  if (allAutoDelivered) {
    db.updateOrderStatus(orderId, 'completed');
    desc += `\n${EMOJI.pkg} Items delivered via DM!`;
    const deliveredItems = db.getOrderItems(orderId);
    try {
      await interaction.user.send({ embeds: [deliveryEmbed(deliveredItems)] });
    } catch {
      desc += `\n${EMOJI.warning} Could not DM you. Check your privacy settings.`;
    }
  } else {
    desc += `\n${EMOJI.warning} Some items need manual delivery. Staff will DM you.`;
  }

  await interaction.editReply({ content: desc });
}
