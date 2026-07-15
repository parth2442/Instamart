import { Message, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ButtonBuilder, ButtonStyle, Interaction, ChatInputCommandInteraction } from 'discord.js';
import { COLORS, config } from './config.js';

const FOOTER = 'Crafted by Parth.cd';
const SUPPORT_URL = 'https://discord.gg/bGAQCMePMm';
function getInviteUrl(): string {
  return `https://discord.com/oauth2/authorize?client_id=${config.clientId}&scope=bot+applications.commands&permissions=8`;
}

interface Category {
  id: string;
  label: string;
  emoji: string;
  desc: string;
  commands: { name: string; desc: string }[];
}

const categories: Category[] = [
  {
    id: 'payments',
    label: 'Payments',
    emoji: '\u{1F4B0}',
    desc: 'UPI, LTC & transaction commands',
    commands: [
      { name: '$upi', desc: 'show|set|presets Manage UPI IDs' },
      { name: '$upiqr', desc: '<preset|id> [amount] [note] Generate UPI payment link' },
      { name: '$ltc', desc: 'show|set|balance|convert|info LTC wallet' },
      { name: '/calc', desc: 'Evaluate a math expression' },
    ],
  },
  {
    id: 'wallet',
    label: 'Wallet',
    emoji: '\u{1F4B0}',
    desc: 'Balance, cart, give coins, orders & referrals',
    commands: [
      { name: '$balance', desc: 'Check your wallet balance' },
      { name: '$give', desc: '<amount> @user Send coins to someone' },
      { name: '$deposit', desc: '@user <amount> Add balance' },
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
      { name: '$admin', desc: 'products|orders|coupon|analytics' },
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

// ── Shared UI components ──

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
        ),
      ),
  );
}

function linkButtons(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setLabel('Invite Me').setStyle(ButtonStyle.Link).setURL(getInviteUrl()).setEmoji('\u{1F517}'),
    new ButtonBuilder().setLabel('Support').setStyle(ButtonStyle.Link).setURL(SUPPORT_URL).setEmoji('\u{1F4AC}'),
  );
}

function backButton(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('help_back').setLabel('Back').setStyle(ButtonStyle.Secondary).setEmoji('\u{1F448}'),
  );
}

// ── Help page builders (embeds for prefix) ──

function homeEmbed(botName: string, avatar: string): EmbedBuilder {
  const lines = categories.map(c => `${c.emoji} \u00BB **${c.label}** \u2014 ${c.desc}`);
  const totalCmds = categories.reduce((s, c) => s + c.commands.length, 0);
  return new EmbedBuilder()
    .setColor(COLORS.gold)
    .setThumbnail(avatar)
    .setDescription([
      `# Hey, I\u2019m **${botName}**`,
      '',
      '',
      `\u2022 My prefix is \`$\``,
      '',
      `\u2022 Type \`$help [category]\` for details`,
      '',
      `\u2022 **Total Commands:** \`${totalCmds}\``,
      '',
      '',
      lines.join('\n\n'),
      '',
      '',
    ].join('\n'))
    .setFooter({ text: FOOTER });
}

function categoryEmbed(cat: Category, avatar: string): EmbedBuilder {
  const lines = cat.commands.map(c => `${cat.emoji} \`${c.name}\`  ${c.desc}`);
  return new EmbedBuilder()
    .setColor(COLORS.gold)
    .setThumbnail(avatar)
    .setDescription([
      `# ${cat.emoji} ${cat.label}`,
      '',
      '',
      cat.desc,
      '',
      '',
      lines.join('\n\n'),
      '',
    ].join('\n'))
    .setFooter({ text: FOOTER });
}

// ── Send help (prefix) ──
export async function sendHelp(msg: Message) {
  const embed = homeEmbed(msg.client.user?.displayName || 'Mega Bazar', msg.client.user?.displayAvatarURL({ forceStatic: false, size: 256 }) || '');
  const row = categorySelect();
  const links = linkButtons();
  const ch = msg.channel as any;
  const botId = msg.client.user?.id;
  // Delete old help embeds to avoid double-embed
  try {
    const msgs = await msg.channel.messages.fetch({ limit: 10 });
    for (const [, m] of msgs) {
      if (m.author.id !== botId) continue;
      const desc = m.embeds?.[0]?.description || '';
      const title = m.embeds?.[0]?.title || '';
      if (title.includes('Hey') || title.includes('Mega') || title.includes('InstaMart') || m.components?.length > 0) {
        await m.delete().catch(() => {});
      }
    }
  } catch (e) { console.error('Cleanup error:', e); }
  const sent = await ch.send({ embeds: [embed], components: [row, links] });
  console.log(`Send: new help ${sent.id}`);
}

// ── Send help (slash) ──
export async function sendHelpSlash(interaction: ChatInputCommandInteraction) {
  const avatar = interaction.client.user?.displayAvatarURL({ forceStatic: false, size: 256 }) || '';
  const name = interaction.client.user?.displayName || 'Mega Bazar';
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
  const name = interaction.client.user?.displayName || 'Mega Bazar';
  const embed = homeEmbed(name, avatar);
  const row = categorySelect();
  const links = linkButtons();
  await interaction.editReply({ embeds: [embed], components: [row, links] });
}
