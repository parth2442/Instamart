import { ContainerBuilder, TextDisplayBuilder } from 'discord.js';

export function gold(text: string, emoji?: string): ContainerBuilder {
  return new ContainerBuilder()
    .setAccentColor(0x000000)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(emoji ? `${emoji} ${text}` : text));
}

export function success(text: string): ContainerBuilder {
  return gold(text, '\u{2705}');
}

export function error(text: string): ContainerBuilder {
  return gold(text, '\u{274C}');
}

export function warning(text: string): ContainerBuilder {
  return gold(text, '\u{26A0}\u{FE0F}');
}

export function info(text: string, emoji?: string): ContainerBuilder {
  return gold(text, emoji);
}
