import { Message, ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder, PermissionFlagsBits, User, GuildMember } from 'discord.js';
import { COLORS } from '../config.js';
import { register as regPrefix, getPrefixHandlers } from '../prefix.js';
import { registerSlash as regSlash, getSlashHandler } from './slash.js';

const slashDefs: any[] = [];

export function getHybridSlashDefs(): any[] {
  return slashDefs;
}

/**
 * Register a command that's ALREADY registered as prefix, also as slash
 * (auto-generates a slash command with a single string "args" option)
 */
export function bridgeToSlash(name: string, description: string) {
  const prefixHandler = getPrefixHandlers().get(name);
  if (!prefixHandler) {
    console.error(`[hybrid] No prefix handler for "${name}"`);
    return;
  }

  let builder = new SlashCommandBuilder()
    .setName(name)
    .setDescription(description)
    .addStringOption(opt => opt.setName('args').setDescription('Command arguments').setRequired(false));

  regSlash(name, async (interaction) => {
    try {
      const args = (interaction.options.getString('args') || '').split(/\s+/).filter(Boolean);
      // Create a mock Message-like context for the prefix handler
      const sendReply = async (content: any) => {
        if (interaction.deferred) await interaction.editReply(content).catch(() => {});
        else await interaction.reply(content).catch(() => {});
      };
      const mockMsg: any = {
        author: interaction.user,
        member: interaction.member,
        guild: interaction.guild,
        client: interaction.client,
        id: interaction.id,
        createdAt: new Date(),
        reply: sendReply,
        channel: Object.assign(Object.create(interaction.channel), { send: sendReply }),
      };
      await prefixHandler(mockMsg, args);
    } catch (e: any) {
      console.error(`[hybrid:${name}]`, e?.message || e);
    }
  });

  slashDefs.push(builder);
}

/**
 * Register a command that's ALREADY registered as slash, also as prefix
 */
export function bridgeToPrefix(name: string, aliases: string[] = []) {
  const slashHandler = getSlashHandler(name);
  if (!slashHandler) {
    console.error(`[hybrid] No slash handler for "${name}"`);
    return;
  }

  const handler = async (msg: Message, args: string[]) => {
    try {
      // Create a mock Interaction-like context for the slash handler
      let replyMsg: any = null;
      const mockInteraction: any = {
        commandName: name,
        user: msg.author,
        member: msg.member,
        guild: msg.guild,
        channel: msg.channel,
        client: msg.client,
        id: msg.id,
        createdAt: msg.createdAt,
        deferred: false,
        replied: false,
        options: {
          getString: (optName: string) => {
            if (optName === 'args') return args.join(' ');
            return null;
          },
          getNumber: () => null,
          getInteger: () => null,
          getUser: () => null,
          getChannel: () => null,
          getRole: () => null,
          getBoolean: () => null,
        },
        deferReply: async () => { mockInteraction.deferred = true; },
        reply: async (content: any) => {
          mockInteraction.replied = true;
          const ch = msg.channel as any;
          if (ch?.send) {
            replyMsg = await ch.send(content).catch(() => null);
          }
        },
        editReply: async (content: any) => {
          if (replyMsg) {
            await replyMsg.edit(content).catch(() => {});
          } else {
            const ch = msg.channel as any;
            if (ch?.send) {
              replyMsg = await ch.send(content).catch(() => null);
            }
          }
        },
      };
      await slashHandler(mockInteraction as any);
    } catch (e: any) {
      console.error(`[hybrid:${name}]`, e?.message || e);
    }
  };

  regPrefix(name, handler);
  for (const alias of aliases) {
    regPrefix(alias, handler);
  }
}
