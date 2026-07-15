import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import * as db from '../database.js';
import * as res from '../response.js';

let botClient: any = null;

export function setVerifyClient(client: any) {
  botClient = client;
}

export function getVerifyClient() { return botClient; }

const SITE_URL = process.env.SITE_URL || `https://megabazar.roundbot.online`;

export async function postVerifyButton(channel: any) {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('verify_me')
      .setEmoji('\u{1F512}')
      .setLabel('Verify')
      .setStyle(ButtonStyle.Success)
  );

  const existingMsgId = await db.getVerifyMessage();
  if (existingMsgId) {
    try {
      const old = await channel.messages.fetch(existingMsgId);
      if (old) {
        await old.edit({ components: [row] });
        return old;
      }
    } catch {}
  }

  const sent = await channel.send({ content: '# \u{1F512} Verify to Access the Server\nClick the button below to verify you are human. You will be redirected to a secure verification page.', components: [row] });
  await db.setVerifyMessage(sent.id);
  return sent;
}

export async function handleVerifyButton(interaction: any) {
  const guildId = interaction.guildId;
  const userId = interaction.user.id;

  const verifyUrl = `${SITE_URL}/verify.html?uid=${userId}&gid=${guildId}`;

  const linkRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setURL(verifyUrl)
      .setEmoji('\u{1F310}')
      .setLabel('Open Verify Page')
  );

  await interaction.reply({
    content: 'Click the link below to complete verification via Cloudflare:',
    components: [linkRow],
    flags: MessageFlags.Ephemeral,
  });
}
