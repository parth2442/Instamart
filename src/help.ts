import { Message, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ButtonBuilder, ButtonStyle, ComponentType, Interaction, ChatInputCommandInteraction } from 'discord.js';
import { COLORS, EMOJI, config } from './config.js';

const FOOTER = 'designed by Parth.cd';
const INVITE_URL = 'https://discord.com/oauth2/authorize?client_id=1492655770859339976&scope=bot+applications.commands&permissions=8';
const SUPPORT_URL = 'https://discord.gg/bGAQCMePMm';

interface Category {
  id: string;
  label: string;
  emoji: string;
  desc: string;
  commands: { name: string; desc: string }[];
}

const categories: Category[] = [
  {
    id: 'wallet',
    label: 'Wallet',
    emoji: '\u{1F4B0}',
    desc: 'Balance, cart, give coins, orders & referrals',
    commands: [
      { name: '$balance', desc: 'Check your wallet balance' },
      { name: '$give', desc: '<amount> @user Send coins to someone' },
      { name: '$cart', desc: 'View your shopping cart' },
      { name: '$history', desc: 'View your order history' },
      { name: '$wishlist', desc: 'View your wishlist' },
      { name: '$referral', desc: 'View your referral code & count' },
    ],
  },
  {
    id: 'shop',
    label: 'Shop',
    emoji: '\u{1F3EA}',
    desc: 'Manage products, stock & inventory codes',
    commands: [
      { name: '$postshop', desc: '[#channel] Post the vending machine' },
      { name: '$restock', desc: 'SLOT <amount> Set product stock' },
      { name: '$stock', desc: 'SLOT add|bulk|list Manage inventory codes' },
    ],
  },
  {
    id: 'admin',
    label: 'Admin',
    emoji: '\u{2699}\u{FE0F}',
    desc: 'Full server management commands',
    commands: [
      { name: '$admin', desc: 'products|orders|deposit|coupon|analytics' },
      { name: '$deposit', desc: '@user <amount> Add balance' },
      { name: '$deliver', desc: 'ORDER_ID CODE Manual code delivery' },
      { name: '$restocker', desc: 'add|remove @user Manage restockers' },
      { name: '$walletadmin', desc: 'add|remove @user Manage wallet admins' },
    ],
  },
  {
    id: 'moderation',
    label: 'Moderation',
    emoji: '\u{1F6E1}\u{FE0F}',
    desc: 'Keep your server safe & clean',
    commands: [
      { name: '$kick', desc: '@user [reason] Kick a member' },
      { name: '$ban', desc: '@user [reason] Ban a member' },
      { name: '$mute', desc: '@user minutes [reason] Timeout member' },
      { name: '$unmute', desc: '@user Remove timeout' },
      { name: '$purge', desc: '[1-100] Bulk delete messages' },
      { name: '$slowmode', desc: '[0-21600] Set channel slowmode' },
      { name: '$announce', desc: '"title" "msg" [#channel] Send announcement' },
    ],
  },
];

function homeEmbed(botName: string, avatar: string): EmbedBuilder {
  const lines = categories.map(c => `${c.emoji} \u00BB **${c.label}** — ${c.desc}`);
  return new EmbedBuilder()
    .setColor(COLORS.gold)
    .setAuthor({ name: `Hey, I\u2019m ${botName}`, iconURL: avatar })
    .setDescription(
      `\u2022 My prefix is \`$\`\n` +
      `\u2022 Type \`$help [category]\` for details\n` +
      `\u2022 Total Commands: \`${categories.reduce((s, c) => s + c.commands.length, 0)}\`\n\n` +
      lines.join('\n')
    )
    .setThumbnail(avatar)
    .setFooter({ text: FOOTER });
}

function categoryEmbed(cat: Category, avatar: string): EmbedBuilder {
  const lines = cat.commands.map(c => `${cat.emoji} \`${c.name}\`  ${c.desc}`);
  return new EmbedBuilder()
    .setColor(COLORS.gold)
    .setAuthor({ name: `${cat.emoji} ${cat.label}`, iconURL: avatar })
    .setDescription(cat.desc + '\n\n' + lines.join('\n'))
    .setThumbnail(avatar)
    .setFooter({ text: FOOTER });
}

function categorySelect(): ActionRowBuilder<StringSelectMenuBuilder> {
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('help_category')
      .setPlaceholder('Select a category')
      .addOptions(
        categories.map(c =>
          new StringSelectMenuOptionBuilder()
            .setLabel(c.label)
            .setValue(c.id)
            .setDescription(c.desc)
            .setEmoji(c.emoji)
        )
      )
  );
}

function linkButtons(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setLabel('Invite Me').setStyle(ButtonStyle.Link).setURL(INVITE_URL).setEmoji('\u{1F517}'),
    new ButtonBuilder().setLabel('Support').setStyle(ButtonStyle.Link).setURL(SUPPORT_URL).setEmoji('\u{1F4AC}'),
  );
}

function backButton(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('help_back').setLabel('Back').setStyle(ButtonStyle.Secondary).setEmoji('\u{1F448}')
  );
}

// ── Send help (prefix) ──
export async function sendHelp(msg: Message) {
  const avatar = msg.client.user?.displayAvatarURL({ forceStatic: false, size: 256 }) || '';
  const name = msg.client.user?.displayName || 'InstaMart';
  const embed = homeEmbed(name, avatar);
  const row = categorySelect();
  const links = linkButtons();
  const ch = msg.channel as any;
  const sent = await ch.send({ embeds: [embed], components: [row, links] });
  (sent as any)._helpAuthorId = msg.author.id;
}

// ── Send help (slash) ──
export async function sendHelpSlash(interaction: ChatInputCommandInteraction) {
  const avatar = interaction.client.user?.displayAvatarURL({ forceStatic: false, size: 256 }) || '';
  const name = interaction.client.user?.displayName || 'InstaMart';
  const embed = homeEmbed(name, avatar);
  const row = categorySelect();
  const links = linkButtons();
  await interaction.reply({ embeds: [embed], components: [row, links] });
}

// ── Handle category select ──
export async function handleHelpCategory(interaction: Interaction) {
  if (!interaction.isStringSelectMenu() || !interaction.isMessageComponent()) return;
  if (interaction.customId !== 'help_category') return;
  await interaction.deferUpdate();
  const catId = interaction.values[0];
  const cat = categories.find(c => c.id === catId);
  if (!cat) return;
  const avatar = interaction.client.user?.displayAvatarURL({ forceStatic: false, size: 256 }) || '';
  const embed = categoryEmbed(cat, avatar);
  const back = backButton();
  await interaction.editReply({ embeds: [embed], components: [back] });
}

// ── Handle back button ──
export async function handleHelpBack(interaction: Interaction) {
  if (!interaction.isButton() || !interaction.isMessageComponent()) return;
  if (interaction.customId !== 'help_back') return;
  await interaction.deferUpdate();
  const avatar = interaction.client.user?.displayAvatarURL({ forceStatic: false, size: 256 }) || '';
  const name = interaction.client.user?.displayName || 'InstaMart';
  const embed = homeEmbed(name, avatar);
  const row = categorySelect();
  const links = linkButtons();
  await interaction.editReply({ embeds: [embed], components: [row, links] });
}
