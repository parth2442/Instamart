import { Message, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Interaction, GuildMember, GuildTextBasedChannel } from 'discord.js';
import { COLORS } from './config.js';

const RULES_CHANNEL_ID = process.env.RULES_CHANNEL_ID || '';
const VERIFIED_ROLE_ID = process.env.VERIFIED_ROLE_ID || '';

const FOOTER = 'designed by Parth.cd';

function rulesEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLORS.gold)
    .setTitle('\u{1F6E1}\u{FE0F} Server Rules')
    .setDescription(
      '1. Be respectful to everyone\n' +
      '2. No spamming or advertising\n' +
      '3. Follow Discord ToS\n' +
      '4. Use appropriate channels\n' +
      '5. No NSFW content\n' +
      '6. Staff decisions are final\n\n' +
      'Click the button below to verify and access the server.'
    )
    .setFooter({ text: FOOTER });
}

export function rulesView(): { embeds: EmbedBuilder[]; components: ActionRowBuilder<ButtonBuilder>[] } {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('accept_rules')
      .setLabel('I will follow the rules')
      .setStyle(ButtonStyle.Success)
      .setEmoji('\u{2705}')
  );
  return { embeds: [rulesEmbed()], components: [row] };
}

export async function handleRulesAccept(interaction: Interaction) {
  if (!interaction.isButton() || interaction.customId !== 'accept_rules') return;
  await interaction.deferReply({ ephemeral: true });

  if (!VERIFIED_ROLE_ID) {
    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(COLORS.gold).setDescription('Verification not configured. Contact staff.').setFooter({ text: FOOTER })] });
    return;
  }

  const member = interaction.member as GuildMember;
  if (!member) {
    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(COLORS.gold).setDescription('Could not verify. Try again.').setFooter({ text: FOOTER })] });
    return;
  }

  try {
    await member.roles.add(VERIFIED_ROLE_ID);
    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(COLORS.gold).setDescription('Verified! You now have access to the server.').setFooter({ text: FOOTER })] });
  } catch {
    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(COLORS.gold).setDescription('Failed to add role. Contact staff.').setFooter({ text: FOOTER })] });
  }
}

// ── Send rules (admin command) ──
export async function sendRules(msg: Message) {
  const view = rulesView();
  const ch = msg.channel as any;
  await ch.send(view);
}
