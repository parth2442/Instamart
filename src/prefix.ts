import { Message, EmbedBuilder } from 'discord.js';
import { COLORS, config } from './config.js';

type PrefixHandler = (msg: Message, args: string[]) => void | Promise<void>;

const handlers = new Map<string, PrefixHandler>();

export function register(name: string, handler: PrefixHandler) {
  handlers.set(name, handler);
}

export function reply(msg: Message, content: string) {
  const ch = msg.channel as any;
  if (ch && typeof ch.send === 'function') {
    ch.send(content).catch(() => {});
  }
}

export function handlePrefix(msg: Message) {
  if (msg.author.bot) return;
  if (!msg.channel?.isTextBased()) return;
  const content = msg.content;

  // Handle @mention ping
  const botId = msg.client.user?.id;
  if (botId && (content.startsWith(`<@${botId}>`) || content.startsWith(`<@!${botId}>`))) {
    const ch = msg.channel as any;
    if (ch?.send) {
      const embed = new EmbedBuilder()
        .setColor(COLORS.gold)
        .setDescription(`\u{1F44B} Hey **${msg.author.username}**! Use \`$\`help for commands.`)
        .setFooter({ text: 'Crafted by Parth.cd' });
      ch.send({ embeds: [embed] }).catch(() => {});
    }
    return;
  }

  if (!content.startsWith(config.prefix)) return;

  const parts = content.slice(config.prefix.length).split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1);

  const handler = handlers.get(cmd);
  if (handler) {
    try {
      const result = handler(msg, args);
      if (result instanceof Promise) {
        result.catch(err => console.error(`Error in ${cmd}:`, err));
      }
    } catch (err) {
      console.error(`Error in ${cmd}:`, err);
    }
  }
}

export function getPrefixHandlers() {
  return handlers;
}
