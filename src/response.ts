import { EmbedBuilder } from 'discord.js';
import { COLORS } from './config.js';

const FOOTER = 'designed by Parth.cd';

export function gold(text: string, emoji?: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLORS.gold)
    .setDescription(emoji ? `${emoji} ${text}` : text)
    .setFooter({ text: FOOTER });
}

export function success(text: string): EmbedBuilder {
  return gold(text, '\u{2705}');
}

export function error(text: string): EmbedBuilder {
  return gold(text, '\u{274C}');
}

export function warning(text: string): EmbedBuilder {
  return gold(text, '\u{26A0}\u{FE0F}');
}

export function info(text: string, emoji?: string): EmbedBuilder {
  return gold(text, emoji);
}
