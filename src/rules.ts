import { Message, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Interaction, GuildMember, GuildTextBasedChannel } from 'discord.js';
import { COLORS } from './config.js';

const TC_CHANNEL_ID = process.env.TC_CHANNEL_ID || '';
const VERIFIED_ROLE_ID = process.env.VERIFIED_ROLE_ID || '';

const FOOTER = 'designed by Parth.cd';

function tcEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLORS.gold)
    .setTitle('\u{1F4DC} Terms & Conditions')
    .setDescription(
      'By using this server, you agree to:\n\n' +
      '1. Follow all Discord Terms of Service\n' +
      '2. Respect all members and staff\n' +
      '3. No spamming, scamming, or harassment\n' +
      '4. No inappropriate content\n' +
      '5. Staff decisions are final\n\n' +
      'Click the button below to accept and access the server.'
    )
    .setFooter({ text: FOOTER });
}

export function tcView(): { embeds: EmbedBuilder[]; components: ActionRowBuilder<ButtonBuilder>[] } {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('accept_tc')
      .setLabel('I have read all the terms and conditions')
      .setStyle(ButtonStyle.Success)
      .setEmoji('\u{2705}')
  );
  return { embeds: [tcEmbed()], components: [row] };
}

export async function handleTcAccept(interaction: Interaction) {
  if (!interaction.isButton() || interaction.customId !== 'accept_tc') return;
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
    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(COLORS.gold).setDescription('Accepted! You now have access to the server.').setFooter({ text: FOOTER })] });
  } catch {
    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(COLORS.gold).setDescription('Failed to add role. Contact staff.').setFooter({ text: FOOTER })] });
  }
}

// ── Send T&C (admin command) ──
export async function sendTc(msg: Message) {
  const view = tcView();
  const ch = msg.channel as any;
  await ch.send(view);
}
