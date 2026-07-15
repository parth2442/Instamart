import { Message, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { EMOJI, COLORS, config, UPI_PRESETS } from '../config.js';
import { register } from '../prefix.js';
import * as db from '../database.js';
import * as res from '../response.js';

const FOOTER = 'Crafted by Parth.cd';

function send(msg: Message, content: string | EmbedBuilder) {
  const ch = msg.channel as any;
  if (typeof content === 'string') return ch.send({ embeds: [new EmbedBuilder().setColor(COLORS.gold).setDescription(content).setFooter({ text: FOOTER })] });
  return ch.send({ embeds: [content] });
}

export function registerPaymentCommands() {
  register('upi', async (msg, args) => {
    const sub = args[0]?.toLowerCase();

    if (!sub || sub === 'show') {
      const saved = await db.getUPI(msg.author.id);
      if (!saved) {
        return send(msg, `${EMOJI.warning} No UPI saved. Use \`$upi set <address>\` or \`$upi <preset>\``);
      }
      const embed = new EmbedBuilder()
        .setColor(COLORS.gold)
        .setTitle(`${EMOJI.coin} Your UPI ID`)
        .setDescription(`\`${saved}\``)
        .setFooter({ text: FOOTER })
        .setTimestamp();
      return send(msg, embed);
    }

    if (sub === 'set') {
      const address = args.slice(1).join('');
      if (!address || !address.includes('@')) {
        return send(msg, `${EMOJI.error} Invalid UPI ID! Example: \`$upi set name@upi\``);
      }
      await db.setUPI(msg.author.id, address);
      return send(msg, `${EMOJI.success} UPI ID saved: \`${address}\``);
    }

    if (sub === 'presets') {
      const lines = Object.entries(UPI_PRESETS).map(([k, v]) => `\`${k}\` → \`${v}\``);
      const embed = new EmbedBuilder()
        .setColor(COLORS.gold)
        .setTitle(`${EMOJI.star} UPI Presets`)
        .setDescription(lines.join('\n'))
        .setFooter({ text: `Use: $upi <preset>` });
      return send(msg, embed);
    }

    // Check if arg is a preset name
    if (UPI_PRESETS[sub]) {
      await db.setUPI(msg.author.id, UPI_PRESETS[sub]);
      return send(msg, `${EMOJI.success} UPI preset \`${sub}\` saved: \`${UPI_PRESETS[sub]}\``);
    }

    send(msg, `${EMOJI.warning} Usage: \`$upi show\` | \`$upi set <address>\` | \`$upi <preset>\` | \`$upi presets\``);
  });

  register('upiqr', async (msg, args) => {
    const target = args[0]?.toLowerCase();
    if (!target) {
      return send(msg, `${EMOJI.warning} Usage: \`$upiqr <preset|upi-id> [amount] [note]\``);
    }
    const amount = args[1] && !isNaN(Number(args[1])) ? args[1] : undefined;
    const noteIdx = amount ? 2 : 1;
    const note = args.slice(noteIdx).join(' ') || undefined;

    const upiId = UPI_PRESETS[target] || target;
    const payeeName = 'Mega Bazar';
    let params = `pa=${upiId}&pn=${payeeName}&cu=INR`;
    if (amount) params += `&am=${amount}`;
    if (note) params += `&tn=${encodeURIComponent(note)}`;
    const upiLink = `upi://pay?${params}`;

    const embed = new EmbedBuilder()
      .setColor(COLORS.gold)
      .setTitle(`${EMOJI.coin} UPI Payment`)
      .setDescription([
        `**Payee:** ${payeeName}`,
        `**UPI ID:** \`${upiId}\``,
        amount ? `**Amount:** ₹${amount}` : '',
        note ? `**Note:** ${note}` : '',
        '',
        `[Pay via UPI](${upiLink})`,
      ].filter(Boolean).join('\n'))
      .setFooter({ text: FOOTER });

    const ch = msg.channel as any;
    await ch.send({ embeds: [embed] });
  });

  register('ltc', async (msg, args) => {
    const sub = args[0]?.toLowerCase();

    if (!sub || sub === 'show') {
      const saved = await db.getLTC(msg.author.id);
      if (!saved) {
        return send(msg, `${EMOJI.warning} No LTC address saved. Use \`$ltc set <address>\``);
      }
      const bal = await db.getLTCBalance(saved);
      const price = await db.getLTCPrice();
      const inr = bal * price.inr;
      const usd = bal * price.usd;
      const embed = new EmbedBuilder()
        .setColor(COLORS.gold)
        .setTitle(`${EMOJI.coin} LTC Wallet`)
        .setDescription([
          `**Address:** \`${saved}\``,
          `**Balance:** ${bal.toFixed(4)} LTC`,
          price.inr ? `**INR:** ₹${inr.toFixed(2)}` : '',
          price.usd ? `**USD:** $${usd.toFixed(2)}` : '',
        ].filter(Boolean).join('\n'))
        .setFooter({ text: FOOTER })
        .setTimestamp();
      return send(msg, embed);
    }

    if (sub === 'set') {
      const address = args[1];
      if (!address) return send(msg, `${EMOJI.error} Usage: \`$ltc set <address>\``);
      await db.setLTC(msg.author.id, address);
      return send(msg, `${EMOJI.success} LTC address saved!`);
    }

    if (sub === 'balance') {
      const address = args[1] || await db.getLTC(msg.author.id);
      if (!address) return send(msg, `${EMOJI.error} No address. Use \`$ltc balance <address>\` or save one with \`$ltc set\``);
      const bal = await db.getLTCBalance(address);
      const price = await db.getLTCPrice();
      const embed = new EmbedBuilder()
        .setColor(COLORS.gold)
        .setTitle(`${EMOJI.coin} LTC Balance`)
        .setDescription([
          `**Address:** \`${address}\``,
          `**Balance:** ${bal.toFixed(4)} LTC`,
          price.inr ? `**≈ ₹**${(bal * price.inr).toFixed(2)}` : '',
          price.usd ? `**≈ $**${(bal * price.usd).toFixed(2)}` : '',
        ].filter(Boolean).join('\n'))
        .setFooter({ text: FOOTER });
      return send(msg, embed);
    }

    if (sub === 'convert') {
      const amount = parseFloat(args[1]);
      const currency = args[2]?.toUpperCase() || 'INR';
      if (isNaN(amount) || amount <= 0) return send(msg, `${EMOJI.error} Usage: \`$ltc convert <amount> <INR|USD>\``);
      const price = await db.getLTCPrice();
      const rate = currency === 'USD' ? price.usd : price.inr;
      if (!rate) return send(msg, `${EMOJI.error} Could not fetch LTC price. Try again later.`);
      const ltcAmount = amount / rate;
      const symbol = currency === 'USD' ? '$' : '₹';
      const embed = new EmbedBuilder()
        .setColor(COLORS.gold)
        .setTitle(`${EMOJI.coin} LTC Convert`)
        .setDescription(`${symbol}${amount.toFixed(2)} ${currency} = **${ltcAmount.toFixed(6)} LTC**`)
        .setFooter({ text: `Rate: 1 LTC = ${symbol}${rate.toFixed(2)} ${currency}` });
      return send(msg, embed);
    }

    if (sub === 'info') {
      const address = args[1] || await db.getLTC(msg.author.id);
      if (!address) return send(msg, `${EMOJI.error} No address. Use \`$ltc info <address>\``);
      const [bal, price, txs] = await Promise.all([
        db.getLTCBalance(address),
        db.getLTCPrice(),
        db.getLTCTxs(address, 3),
      ]);
      const embed = new EmbedBuilder()
        .setColor(COLORS.gold)
        .setTitle(`${EMOJI.coin} LTC Address Info`)
        .setDescription([
          `**Address:** \`${address}\``,
          `**Balance:** ${bal.toFixed(4)} LTC`,
          price.inr ? `**≈ ₹**${(bal * price.inr).toFixed(2)}` : '',
          price.usd ? `**≈ $**${(bal * price.usd).toFixed(2)}` : '',
          '',
          '**Recent Transactions:**',
          ...(txs.length > 0 ? txs.map((tx: any) => `• \`${(tx.tx_hash || '').slice(0, 12)}...\` ${tx.value / 1e8} LTC`) : ['No recent transactions']),
        ].filter(Boolean).join('\n'))
        .setFooter({ text: 'BlockCypher' });
      return send(msg, embed);
    }

    send(msg, `${EMOJI.warning} Usage: \`$ltc show\` | \`$ltc set <address>\` | \`$ltc balance [address]\` | \`$ltc convert <amount> <INR|USD>\` | \`$ltc info [address]\``);
  });
}
