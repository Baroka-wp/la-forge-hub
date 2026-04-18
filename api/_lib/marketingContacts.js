import { prisma } from './prisma.js';
import { normalizeEmail } from './email.js';
import {
  sendBrevoEmail,
  buildNewWebinarBroadcastEmail,
  buildReplayAvailableEmail,
  buildAdminWebinarCreatedEmail,
  webinarEmailLabels,
} from './brevo.js';

/**
 * @param {{ emailKey: string, displayName?: string | null, phone?: string | null, marketingOptIn: boolean }} p
 */
export async function upsertMarketingContact(p) {
  const emailKey = normalizeEmail(p.emailKey);
  if (!emailKey || !emailKey.includes('@')) return null;

  const existing = await prisma.marketingContact.findUnique({ where: { emailKey } });
  /** Une fois opt-in, on conserve true (pas de retrait via ce flux seul). */
  const marketingOptIn = !!(existing?.marketingOptIn || p.marketingOptIn);
  const displayName =
    p.displayName != null && String(p.displayName).trim()
      ? String(p.displayName).trim()
      : existing?.displayName ?? null;
  const phone =
    p.phone != null && String(p.phone).trim() ? String(p.phone).trim() : existing?.phone ?? null;

  return prisma.marketingContact.upsert({
    where: { emailKey },
    create: {
      emailKey,
      displayName,
      phone,
      marketingOptIn: !!p.marketingOptIn,
    },
    update: {
      displayName: displayName ?? undefined,
      phone: phone ?? undefined,
      marketingOptIn,
    },
  });
}

/** @param {string} userId */
export async function syncUserMarketingPreference(userId, marketingOptIn) {
  await prisma.user.update({
    where: { id: userId },
    data: { marketingOptIn: !!marketingOptIn },
  });
  const u = await prisma.user.findUnique({ where: { id: userId } });
  if (!u) return;
  await upsertMarketingContact({
    emailKey: u.email,
    displayName: u.displayName,
    phone: null,
    marketingOptIn: !!marketingOptIn,
  });
}

async function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** @param {import('@prisma/client').Webinar} webinar */
export async function broadcastNewWebinarToOptIns(webinar) {
  const ctx = webinarEmailLabels(webinar);
  const { subject, htmlContent } = buildNewWebinarBroadcastEmail(webinar, ctx);
  const contacts = await prisma.marketingContact.findMany({
    where: { marketingOptIn: true },
    select: { emailKey: true, displayName: true },
  });
  for (const c of contacts) {
    await sendBrevoEmail(
      { email: c.emailKey, name: c.displayName || undefined },
      { subject, htmlContent },
    );
    await delay(120);
  }
}

/** @param {import('@prisma/client').Webinar} webinar */
export async function broadcastReplayAvailableToOptIns(webinar) {
  const { subject, htmlContent } = buildReplayAvailableEmail(webinar);
  const contacts = await prisma.marketingContact.findMany({
    where: { marketingOptIn: true },
    select: { emailKey: true, displayName: true },
  });
  for (const c of contacts) {
    await sendBrevoEmail(
      { email: c.emailKey, name: c.displayName || undefined },
      { subject, htmlContent },
    );
    await delay(120);
  }
}

/** @param {import('@prisma/client').Webinar} webinar */
export async function notifyAdminWebinarCreated(webinar) {
  const built = buildAdminWebinarCreatedEmail(webinar);
  if (!built) return;
  const { to, subject, htmlContent } = built;
  await sendBrevoEmail(to, { subject, htmlContent });
}
