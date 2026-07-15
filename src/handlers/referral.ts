import { Events, GatewayIntentBits, Client } from 'discord.js';
import * as db from '../database.js';
import { logReferral } from './logger.js';

let botClient: any = null;

export function setReferralClient(client: any) {
  botClient = client;
}

// Guild invite cache: Map<inviteCode, { inviterId: string, uses: number }>
const inviteCache = new Map<string, { inviterId: string; uses: number }>();

export async function initInviteTracking(client: any, guildId: string) {
  try {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;
    const invites = await guild.invites.fetch().catch(() => null);
    if (!invites) return;
    inviteCache.clear();
    invites.each((inv: any) => {
      if (inv.inviter) {
        inviteCache.set(inv.code, { inviterId: inv.inviter.id, uses: inv.uses });
      }
    });
  } catch {}
}

export async function handleGuildMemberAdd(member: any) {
  try {
    const guild = member.guild;
    const invites = await guild.invites.fetch().catch(() => null);
    if (!invites) return;

    // Find which invite was used (uses increased from cache)
    let inviterId: string | null = null;
    invites.each((inv: any) => {
      if (!inv.inviter || inviterId) return;
      const cached = inviteCache.get(inv.code);
      if (cached && inv.uses > cached.uses) {
        inviterId = inv.inviter.id;
      }
    });

    // Update cache with current invite counts
    inviteCache.clear();
    invites.each((inv: any) => {
      if (inv.inviter) {
        inviteCache.set(inv.code, { inviterId: inv.inviter.id, uses: inv.uses });
      }
    });

    if (inviterId && inviterId !== member.id) {
      await db.ensureUser(member.id);
      await db.ensureUser(inviterId);
      await db.setReferredBy(member.id, inviterId);
      logReferral(member.client, { newUserId: member.id, inviterId });
    }
  } catch {}
}

export async function handleInviteCreate(invite: any) {
  if (invite.inviter) {
    inviteCache.set(invite.code, { inviterId: invite.inviter.id, uses: invite.uses || 0 });
  }
}

export async function handleInviteDelete(invite: any) {
  inviteCache.delete(invite.code);
}

// ─── Referral Reward ───

export async function creditReferralReward(buyerId: string, orderAmount: number) {
  if (orderAmount < 50) return; // Only for orders >= ₹50
  const isFirstOrder = (await db.getUserCompletedOrderCount(buyerId)) <= 1;
  if (!isFirstOrder) return; // Only first order qualifies

  const referredBy = await db.getReferredBy(buyerId);
  if (!referredBy) return;

  const reward = Math.round(orderAmount * 0.1); // 10% of first order
  if (reward <= 0) return;

  await db.updateBalance(referredBy, reward);
  logReferral(botClient, { newUserId: buyerId, inviterId: referredBy, reward, orderAmount });
}
