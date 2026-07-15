import dotenv from 'dotenv';
dotenv.config();

export const config = {
  token: process.env.DISCORD_BOT_TOKEN || '',
  clientId: process.env.CLIENT_ID || '',
  guildId: process.env.GUILD_ID || '',
  adminRoleId: process.env.ADMIN_ROLE_ID || '',
  botOwnerIds: (process.env.BOT_OWNER_IDS || '').split(',').filter(Boolean),
  prefix: process.env.PREFIX || '$',
};

export const COLORS = {
  gold: 0xD4AF37,
  success: 0x00C853,
  error: 0xFF1744,
  warning: 0xFFD600,
  info: 0xECEFF1,
};

export const UPI_PRESETS: Record<string, string> = {
  silver: 'coder2442@okaxis',
  gold: 'coder2442@okaxis',
  diamond: 'coder2442@okaxis',
};

export const EMOJI = {
  vending: '\u{1F3EA}',
  coin: '\u{1F4B0}',
  cart: '\u{1F6D2}',
  gift: '\u{1F381}',
  star: '\u{2B50}',
  warning: '\u{26A0}\u{FE0F}',
  success: '\u{2705}',
  error: '\u{274C}',
  soldOut: '\u{274C}',
  lowStock: '\u{26A0}\u{FE0F}',
  inStock: '\u{2705}',
  daily: '\u{1F3B0}',
  lucky: '\u{1F3B2}',
  fire: '\u{1F525}',
  pkg: '\u{1F4E6}',
  invoice: '\u{1F9FE}',
  referral: '\u{1F517}',
  wishlist: '\u{1F4CB}',
  coupon: '\u{1F3F7}\u{FE0F}',
  analytics: '\u{1F4CA}',
  settings: '\u{2699}\u{FE0F}',
  shield: '\u{1F6E1}\u{FE0F}',
};
