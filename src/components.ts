import {
  ContainerBuilder, SectionBuilder, TextDisplayBuilder, SeparatorBuilder,
  ThumbnailBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  SeparatorSpacingSize,
} from 'discord.js';

const FOOTER = '-# Crafted by Parth.cd';

export const spacing = {
  small: SeparatorSpacingSize.Small,
  large: SeparatorSpacingSize.Large,
};

// ─── Container Factories ───

export function goldContainer(content: string): ContainerBuilder {
  return new ContainerBuilder()
    .setAccentColor(0x000000)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(spacing.small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(FOOTER));
}

export function errorContainer(message: string): ContainerBuilder {
  return new ContainerBuilder()
    .setAccentColor(0x000000)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`<:error:1505318845592899754> **Error**\n${message}`))
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(spacing.small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(FOOTER));
}

export function successContainer(message: string): ContainerBuilder {
  return new ContainerBuilder()
    .setAccentColor(0x000000)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`<:success:1505318677350715423> ${message}`))
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(spacing.small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(FOOTER));
}

export function warningContainer(message: string): ContainerBuilder {
  return new ContainerBuilder()
    .setAccentColor(0x000000)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`<:Warning:1505318801661628587> ${message}`))
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(spacing.small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(FOOTER));
}

export function infoContainer(title: string, message: string): ContainerBuilder {
  return new ContainerBuilder()
    .setAccentColor(0x000000)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**${title}**\n${message}`))
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(spacing.small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(FOOTER));
}

// ─── Section with Thumbnail ───

export function sectionWithThumbnail(title: string, description: string, avatarUrl: string): SectionBuilder {
  return new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(title),
      new TextDisplayBuilder().setContent(description),
    )
    .setThumbnailAccessory(
      new ThumbnailBuilder()
        .setURL(avatarUrl)
        .setDescription('Bot Avatar'),
    );
}

// ─── Button Helpers ───

export function linkButton(label: string, url: string, emoji?: string): ButtonBuilder {
  const btn = new ButtonBuilder().setLabel(label).setStyle(ButtonStyle.Link).setURL(url);
  if (emoji) btn.setEmoji(emoji);
  return btn;
}

export function primaryButton(label: string, customId: string, emoji?: string): ButtonBuilder {
  const btn = new ButtonBuilder().setLabel(label).setStyle(ButtonStyle.Primary).setCustomId(customId);
  if (emoji) btn.setEmoji(emoji);
  return btn;
}

export function secondaryButton(label: string, customId: string, emoji?: string): ButtonBuilder {
  const btn = new ButtonBuilder().setLabel(label).setStyle(ButtonStyle.Secondary).setCustomId(customId);
  if (emoji) btn.setEmoji(emoji);
  return btn;
}

export function dangerButton(label: string, customId: string, emoji?: string): ButtonBuilder {
  const btn = new ButtonBuilder().setLabel(label).setStyle(ButtonStyle.Danger).setCustomId(customId);
  if (emoji) btn.setEmoji(emoji);
  return btn;
}

// ─── Separator ───

export function separator(space: number = spacing.large): SeparatorBuilder {
  return new SeparatorBuilder().setSpacing(space);
}
