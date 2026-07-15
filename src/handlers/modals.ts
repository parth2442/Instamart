import { MessageFlags, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { randomBytes } from 'crypto';
import { EMOJI, COLORS } from '../config.js';
import { formatCurrency, generateOrderId, sleep } from '../utils.js';
import * as db from '../database.js';
import * as res from '../response.js';
import { getPendingDirectBuy, updateVendingPanel } from './vending.js';
import { creditReferralReward } from './referral.js';
import { logPurchase } from './logger.js';

const SITE_URL = process.env.SITE_URL || 'https://megabazar.roundbot.online';

function genToken(): string {
  return randomBytes(16).toString('hex');
}

// ─── Checkout Modal (existing) ───

export async function handleCheckoutModal(interaction: any) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  await db.ensureUser(interaction.user.id);
  const couponCode = interaction.fields.getTextInputValue('coupon_code')?.trim().toUpperCase();

  const directBuyProductId = getPendingDirectBuy(interaction.user.id);
  let items: any[];

  if (directBuyProductId) {
    const product = await db.getProductById(directBuyProductId);
    if (!product) {
      await interaction.editReply({ flags: MessageFlags.IsComponentsV2, embeds: [], components: [res.error('Product not found!')] });
      return;
    }
    items = [{
      product_id: product.id,
      product_name: product.name,
      quantity: 1,
      product_price: product.price,
      product_price_usd: product.price_usd,
      slot_id: product.slot_id,
    }];
  } else {
    items = await db.getCart(interaction.user.id);
  }

  if (items.length === 0) {
    await interaction.editReply({ flags: MessageFlags.IsComponentsV2, embeds: [], components: [res.warning('Nothing to checkout!')] });
    return;
  }

  let total = items.reduce((sum: number, item: any) => sum + item.product_price * item.quantity, 0);
  let discount = 0;
  let couponUsed: any = null;

  if (couponCode) {
    couponUsed = await db.getCoupon(couponCode);
    if (!couponUsed) {
      await interaction.editReply({ flags: MessageFlags.IsComponentsV2, embeds: [], components: [res.error('Invalid coupon code!')] });
      return;
    }
    if (couponUsed.max_uses > 0 && couponUsed.used_count >= couponUsed.max_uses) {
      await interaction.editReply({ flags: MessageFlags.IsComponentsV2, embeds: [], components: [res.error('Coupon has reached max uses!')] });
      return;
    }
    if (total < couponUsed.min_purchase) {
      await interaction.editReply({ flags: MessageFlags.IsComponentsV2, embeds: [], components: [res.error(`Minimum purchase of ${formatCurrency(couponUsed.min_purchase)} required!`)] });
      return;
    }
    discount = Math.round(total * couponUsed.discount_percent) / 100;
    total = Math.max(0, total - discount);
  }

  if (total === 0) {
    await processFreeOrder(interaction, items);
    if (couponUsed) await db.useCoupon(couponUsed.id);
    return;
  }

  // Store checkout session for payment method selection
  pendingCheckouts.set(interaction.user.id, { items, total, discount, orderId: await generateOrderId(), couponId: couponUsed?.id, createdAt: Date.now() });

  const bal = await db.getUserBalance(interaction.user.id);
  const desc = [
    `**Order Summary**`,
    items.map(i => `\`${i.product_name}\` x${i.quantity} — ${formatCurrency(i.product_price * i.quantity)}`).join('\n'),
    '',
    `**Total:** ${formatCurrency(total)}${discount > 0 ? ` (-${formatCurrency(discount)} coupon)` : ''}`,
    `**Balance:** ${formatCurrency(bal)}`,
  ].join('\n');

  const row = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder().setCustomId('pay_balance').setEmoji('\u{1F4B0}').setLabel('Balance').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('pay_upi').setEmoji('\u{1F4B1}').setLabel('UPI').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('pay_ltc').setEmoji('\u{1F3E6}').setLabel('LTC').setStyle(ButtonStyle.Secondary),
    );

  await interaction.editReply({
    flags: MessageFlags.IsComponentsV2,
    embeds: [],
    components: [res.info(desc, '\u{1F6D2}'), row],
  });
}

// ─── Checkout Sessions ───

const pendingCheckouts = new Map<string, { items: any[]; total: number; discount: number; orderId: string; couponId?: number; createdAt: number }>();

function takeCheckout(userId: string) {
  const s = pendingCheckouts.get(userId);
  pendingCheckouts.delete(userId);
  return s;
}

// Cleanup stale checkout sessions every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [userId, session] of pendingCheckouts) {
    if (now - session.createdAt > 10 * 60 * 1000) {
      pendingCheckouts.delete(userId);
    }
  }
}, 5 * 60 * 1000);

async function processFreeOrder(interaction: any, items: any[]) {
  const orderId = await generateOrderId();
  await db.createOrder(orderId, interaction.user.id, 0);
  let allAutoDelivered = true;
  for (const item of items) {
    const product = await db.getProductById(item.product_id);
    if (!product) continue;
    await db.addOrderItem(orderId, product.id, product.name, item.quantity, product.price);
    const codes: string[] = [];
    for (let i = 0; i < item.quantity; i++) {
      const invItem = await db.claimAvailableCode(product.id, orderId, interaction.user.id);
      if (invItem) {
        codes.push(invItem.code);
      } else {
        allAutoDelivered = false;
      }
    }
    if (codes.length > 0) {
      const orderItems = await db.getOrderItems(orderId);
      const lastItem = orderItems[orderItems.length - 1];
      await db.updateDeliveryMessage(lastItem.id, codes.join(', '));
    }
  }
  if (allAutoDelivered) {
    await db.updateOrderStatus(orderId, 'completed');
  }
  const lines = ['Free order placed!', `**Order ID:** \`${orderId.slice(0, 8)}\``];
  if (allAutoDelivered) {
    lines.push('Items delivered via DM!');
    await sendDeliveryDM(interaction, orderId);
  } else {
    lines.push('Some items need manual delivery.');
  }
  await interaction.editReply({ flags: MessageFlags.IsComponentsV2, embeds: [], components: [res.info(lines.join('\n'), '\u{2705}')] });
  updateVendingPanel(interaction.client);
  logPurchase(interaction.client, {
    buyerId: interaction.user.id,
    buyerTag: interaction.user.tag,
    items: items.map(i => ({ name: i.product_name, qty: i.quantity, price: i.product_price })),
    total: 0,
    method: 'free',
    orderId,
    status: allAutoDelivered ? 'completed' : 'pending',
  });
  creditReferralReward(interaction.user.id, 0);
}

// ─── Balance Payment ───

export async function handlePayBalance(interaction: any) {
  const session = takeCheckout(interaction.user.id);
  if (!session) {
    await interaction.reply({ flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral, components: [res.error('Session expired! Checkout again.')] });
    return;
  }
  const { items, total, orderId, couponId } = session;
  const ok = await db.deductBalance(interaction.user.id, total);
  if (!ok) {
    pendingCheckouts.set(interaction.user.id, session);
    const bal = await db.getUserBalance(interaction.user.id);
    await interaction.reply({ flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral, components: [res.error(`Need ${formatCurrency(total)}, have ${formatCurrency(bal)}`)] });
    return;
  }

  try {
    await db.createOrder(orderId, interaction.user.id, total);
  } catch (err) {
    await db.updateBalance(interaction.user.id, total);
    pendingCheckouts.set(interaction.user.id, session);
    await interaction.reply({ flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral, components: [res.error('Failed to create order. Balance refunded.')] });
    return;
  }
  if (couponId) await db.useCoupon(couponId);
  await db.updateTotalSpent(interaction.user.id, total);

  let allAutoDelivered = true;
  for (const item of items) {
    const product = await db.getProductById(item.product_id);
    if (!product) continue;
    await db.addOrderItem(orderId, product.id, product.name, item.quantity, product.price);
    const codes: string[] = [];
    for (let i = 0; i < item.quantity; i++) {
      const invItem = await db.claimAvailableCode(product.id, orderId, interaction.user.id);
      if (invItem) {
        codes.push(invItem.code);
      } else {
        allAutoDelivered = false;
      }
    }
    if (codes.length > 0) {
      const orderItems = await db.getOrderItems(orderId);
      await db.updateDeliveryMessage(orderItems[orderItems.length - 1].id, codes.join(', '));
    }
  }
  await db.clearCart(interaction.user.id);

  const lines = [
    `Order placed!`,
    `**Order ID:** \`${orderId.slice(0, 8)}\``,
    `**Charged:** ${formatCurrency(total)}`,
  ];
  if (allAutoDelivered) {
    await db.updateOrderStatus(orderId, 'completed');
    lines.push('Items delivered via DM!');
    await sendDeliveryDM(interaction, orderId);
  } else {
    lines.push('Manual delivery pending. Staff will DM you.');
  }
  await interaction.reply({ flags: MessageFlags.IsComponentsV2, embeds: [], components: [res.info(lines.join('\n'), '\u{2705}')] });
  updateVendingPanel(interaction.client);
  logPurchase(interaction.client, {
    buyerId: interaction.user.id,
    buyerTag: interaction.user.tag,
    items: items.map((i: any) => ({ name: i.product_name, qty: i.quantity, price: i.product_price })),
    total,
    method: 'balance',
    orderId,
    status: allAutoDelivered ? 'completed' : 'pending',
  });
  creditReferralReward(interaction.user.id, total);
}

// ─── UPI Payment ───

export async function handlePayUPI(interaction: any) {
  const session = takeCheckout(interaction.user.id);
  if (!session) {
    await interaction.reply({ flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral, components: [res.error('Session expired! Checkout again.')] });
    return;
  }
  const { items, total, orderId, couponId } = session;
  const merchantUPI = await db.getMerchantUPI();
  const merchantLTC = await db.getMerchantLTC();
  const token = genToken();

  await db.createOrder(orderId, interaction.user.id, total);
  if (couponId) await db.useCoupon(couponId);
  for (const item of items) {
    const product = await db.getProductById(item.product_id);
    if (!product) continue;
    await db.addOrderItem(orderId, product.id, product.name, item.quantity, product.price);
  }
  await db.createPaymentSession(token, {
    orderId, userId: interaction.user.id, method: 'upi',
    amount: total, merchantUPI, merchantLTC,
  });

  const link = `${SITE_URL}/pay/${token}`;
  const desc = [
    `### \u{1F4B1} Pay via UPI`,
    '',
    `**Amount:** \u{20B9}${total}`,
    `**UPI ID:** \`${merchantUPI}\``,
    '',
    `Click below to pay on our secure payment page.`,
  ].join('\n');

  const row = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(link).setLabel('\u{1F4B1} Open Payment Page'),
    );

  await interaction.reply({
    flags: MessageFlags.IsComponentsV2,
    embeds: [],
    components: [res.info(desc, '\u{1F4B1}'), row],
  });
}

// ─── LTC Payment ───

export async function handlePayLTC(interaction: any) {
  const session = takeCheckout(interaction.user.id);
  if (!session) {
    await interaction.reply({ flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral, components: [res.error('Session expired! Checkout again.')] });
    return;
  }
  const { items, total, orderId, couponId } = session;
  const price = await db.getLTCPrice();
  if (!price.inr) {
    await interaction.reply({ flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral, components: [res.error('Could not fetch LTC price. Try again later.')] });
    return;
  }

  const ltcAmount = total / price.inr;
  const merchantUPI = await db.getMerchantUPI();
  const merchantLTC = await db.getMerchantLTC();
  const token = genToken();

  await db.createOrder(orderId, interaction.user.id, total);
  if (couponId) await db.useCoupon(couponId);
  for (const item of items) {
    const product = await db.getProductById(item.product_id);
    if (!product) continue;
    await db.addOrderItem(orderId, product.id, product.name, item.quantity, product.price);
  }
  await db.createPaymentSession(token, {
    orderId, userId: interaction.user.id, method: 'ltc',
    amount: total, merchantUPI, merchantLTC,
    ltcAmount, ltcPrice: price.inr,
  });

  const link = `${SITE_URL}/pay/${token}`;
  const desc = [
    `### \u{1F3E6} Pay with Litecoin`,
    '',
    `**Amount:** ${formatCurrency(total)} = **${ltcAmount.toFixed(6)} LTC**`,
    `**Rate:** 1 LTC = \u{20B9}${price.inr.toLocaleString()}`,
    '',
    `Click below to pay on our secure payment page.`,
  ].join('\n');

  const row = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(link).setLabel('\u{1F3E6} Open Payment Page'),
    );

  await interaction.reply({
    flags: MessageFlags.IsComponentsV2,
    embeds: [],
    components: [res.info(desc, '\u{1F3E6}'), row],
  });
}

// ─── Cancel ───

export async function handleCancelPayment(interaction: any) {
  takeCheckout(interaction.user.id);
  await interaction.reply({ flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral, components: [res.info('Payment cancelled.', '\u{274C}')] });
}

// ─── Delivery Helpers ───

export async function deliverOrderItems(orderId: string, userId: string): Promise<{ allDelivered: boolean; items: any[] }> {
  const items = await db.getOrderItems(orderId);
  let allDelivered = true;
  for (const item of items) {
    if (item.delivery_status === 'delivered') continue;
    const product = await db.getProductById(item.product_id);
    if (!product) { allDelivered = false; continue; }
    const codes: string[] = [];
    for (let i = 0; i < item.quantity; i++) {
      const invItem = await db.claimAvailableCode(product.id, orderId, userId);
      if (invItem) {
        codes.push(invItem.code);
      } else {
        allDelivered = false;
      }
    }
    if (codes.length > 0) {
      await db.updateDeliveryMessage(item.id, codes.join(', '));
    }
  }
  if (allDelivered) {
    await db.updateOrderStatus(orderId, 'completed');
  }
  const updatedItems = await db.getOrderItems(orderId);
  return { allDelivered, items: updatedItems };
}

export async function sendDeliveryDM(context: any, orderId: string, targetUserId?: string) {
  const client = context.client || context;
  const uid = targetUserId || context.user?.id;
  if (!uid) return;
  const items = await db.getOrderItems(orderId);
  if (items.length === 0) return;

  const lines: string[] = [];
  for (const item of items) {
    const status = item.delivery_status === 'delivered' ? '\u{2705}' : '\u{23F3}';
    const code = item.delivery_message ? `\`${item.delivery_message}\`` : '*manual*';
    lines.push(`${status} **${item.product_name}**: ${code}`);
    // Fetch product for how_to_use
    const product = await db.getProductById(item.product_id);
    if (product?.how_to_use) {
      lines.push(`> *How to use:* ${product.how_to_use}`);
    }
    lines.push('');
  }

  const embed = new EmbedBuilder()
    .setColor(COLORS.gold)
    .setDescription([
      '### \u{1F4E6} Delivery',
      '',
      ...lines,
      '-# Crafted by Parth.cd',
    ].join('\n'))
    .setFooter({ text: 'Crafted by Parth.cd' });

  try {
    const user = await client.users.fetch(uid);
    await user.send({ embeds: [embed] });
  } catch {}
}
