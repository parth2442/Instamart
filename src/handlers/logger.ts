import { EmbedBuilder, TextChannel } from 'discord.js';

let logChannelId: string | null = null;

export function setLogChannelId(id: string | null) {
  logChannelId = id;
}

export function getLogChannelId(): string | null {
  return logChannelId;
}

async function sendLog(client: any, embed: EmbedBuilder) {
  if (!logChannelId || !client) return;
  try {
    const channel = client.channels.cache.get(logChannelId) as TextChannel;
    if (channel) await channel.send({ embeds: [embed] });
  } catch {}
}

// ─── Purchase Log ───

export async function logPurchase(client: any, data: {
  buyerId: string;
  buyerTag?: string;
  items: { name: string; qty: number; price: number }[];
  total: number;
  method: 'balance' | 'upi' | 'ltc' | 'free';
  orderId: string;
  status?: string;
}) {
  const methodEmoji = { balance: '\u{1F4B0}', upi: '\u{1F4B1}', ltc: '\u{1F3E6}', free: '\u{1F3B1}' };
  const desc = [
    `**Buyer:** <@${data.buyerId}> ${data.buyerTag || ''}`,
    `**Order ID:** \`${data.orderId.slice(0, 8)}\``,
    `**Method:** ${methodEmoji[data.method]} ${data.method.toUpperCase()}`,
    `**Total:** \u{20B9}${data.total}`,
    data.status ? `**Status:** ${data.status}` : '',
    '',
    '**Items:**',
    ...data.items.map(i => `\u{2022} ${i.name} x${i.qty} — \u{20B9}${i.price}`),
  ].filter(Boolean).join('\n');

  const embed = new EmbedBuilder()
    .setColor(0x2ea043)
    .setTitle('\u{1F4E6} New Purchase')
    .setDescription(desc)
    .setTimestamp();

  await sendLog(client, embed);
}

// ─── Referral Log ───

export async function logReferral(client: any, data: {
  newUserId: string;
  inviterId: string;
  reward?: number;
  orderAmount?: number;
}) {
  const desc = [
    `**New Member:** <@${data.newUserId}>`,
    `**Invited by:** <@${data.inviterId}>`,
    data.orderAmount ? `**Order Amount:** \u{20B9}${data.orderAmount}` : '',
    data.reward ? `**Reward:** \u{20B9}${data.reward} credited to <@${data.inviterId}>` : '',
  ].filter(Boolean).join('\n');

  const embed = new EmbedBuilder()
    .setColor(0x58a6ff)
    .setTitle('\u{1F517} Referral' + (data.reward ? ' Reward' : ''))
    .setDescription(desc)
    .setTimestamp();

  await sendLog(client, embed);
}

// ─── Admin Action Log ───

export async function logAdmin(client: any, data: {
  adminId: string;
  action: string;
  details: string;
}) {
  const embed = new EmbedBuilder()
    .setColor(0xf0883e)
    .setTitle('\u{1F6E1}\u{FE0F} Admin Action')
    .setDescription([
      `**Admin:** <@${data.adminId}>`,
      `**Action:** ${data.action}`,
      `**Details:** ${data.details}`,
    ].join('\n'))
    .setTimestamp();

  await sendLog(client, embed);
}

// ─── Error Log ───

export async function logError(client: any, context: string, error: any) {
  const embed = new EmbedBuilder()
    .setColor(0xda3633)
    .setTitle('\u{26A0}\u{FE0F} Error')
    .setDescription([
      `**Context:** ${context}`,
      `**Error:** ${error?.message || error || 'Unknown'}`,
      error?.stack ? `\`\`\`${error.stack.slice(0, 1500)}\`\`\`` : '',
    ].filter(Boolean).join('\n'))
    .setTimestamp();

  await sendLog(client, embed);
}
