import { prisma } from './_lib/prisma.js';
import { requireAdmin } from './_lib/auth.js';
import { readJsonBody, sendJson, setCors } from './_lib/http.js';
import { normalizeEmail } from './_lib/email.js';
import { sendBrevoEmail } from './_lib/brevo.js';
import { upsertMarketingContact } from './_lib/marketingContacts.js';

function parseQuery(req) {
  const raw = String(req.originalUrl || req.url || '');
  const qStr = raw.includes('?') ? raw.split('?').slice(1).join('?') : '';
  const params = new URLSearchParams(qStr);
  let page = Math.max(1, parseInt(String(params.get('page') || '1'), 10) || 1);
  let pageSize = Math.min(100, Math.max(5, parseInt(String(params.get('pageSize') || '25'), 10) || 25));
  const q = String(params.get('q') || '').trim().toLowerCase().slice(0, 200);
  const optInRaw = String(params.get('marketingOptIn') || '').trim().toLowerCase();
  const marketingOptIn = optInRaw === 'true' ? true : optInRaw === 'false' ? false : null;
  return { page, pageSize, q, marketingOptIn };
}

function stripUnsafeHtml(html) {
  return String(html || '')
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/\s(on\w+)\s*=\s*["'][^"']*["']/gi, '')
    .replace(/\s(on\w+)\s*=\s*[^\s>]+/gi, '');
}

async function sleepMs(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** POST /api/admin/crm/contacts */
export async function adminCreateMarketingContact(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Méthode non autorisée' });
  }
  try {
    const auth = await requireAdmin(req);
    if (auth.error) return sendJson(res, auth.status, { error: auth.error });

    const body = await readJsonBody(req);
    const emailKey = normalizeEmail(body.email);
    if (!emailKey || !emailKey.includes('@')) {
      return sendJson(res, 400, { error: 'E-mail invalide' });
    }
    const displayName = body.displayName != null ? String(body.displayName).trim() || null : null;
    const phone = body.phone != null ? String(body.phone).trim() || null : null;
    const marketingOptIn = body.marketingOptIn === true || body.marketingOptIn === 'true';

    const row = await upsertMarketingContact({ emailKey, displayName, phone, marketingOptIn });
    if (!row) return sendJson(res, 400, { error: 'Impossible de créer le contact' });

    return sendJson(res, 201, {
      contact: {
        id: row.id,
        email: row.emailKey,
        displayName: row.displayName,
        phone: row.phone,
        marketingOptIn: row.marketingOptIn,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      },
    });
  } catch (e) {
    console.error(e);
    return sendJson(res, 500, { error: e.message || 'Erreur serveur' });
  }
}

/**
 * POST /api/admin/crm/send-email
 * body: { subject, htmlContent, mode: "all"|"selection", contactIds?: string[], onlyOptIn?: boolean }
 */
export async function adminCrmSendEmail(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Méthode non autorisée' });
  }
  try {
    const auth = await requireAdmin(req);
    if (auth.error) return sendJson(res, auth.status, { error: auth.error });

    const body = await readJsonBody(req);
    const subject = String(body.subject || '').trim().slice(0, 500);
    const htmlContent = stripUnsafeHtml(body.htmlContent);
    const onlyOptIn = body.onlyOptIn === true || body.onlyOptIn === 'true';
    const optFilterRaw = String(body.marketingOptInFilter || '').trim().toLowerCase();
    const marketingOptInFilter = optFilterRaw === 'true' ? true : optFilterRaw === 'false' ? false : null;
    const mode = body.mode === 'selection' ? 'selection' : 'all';
    const contactIds = Array.isArray(body.contactIds) ? body.contactIds.map(String) : [];
    const searchQ = String(body.searchQuery || '')
      .trim()
      .toLowerCase()
      .slice(0, 200);
    const searchWhere = searchQ
      ? {
          OR: [
            { emailKey: { contains: searchQ, mode: 'insensitive' } },
            { displayName: { contains: searchQ, mode: 'insensitive' } },
          ],
        }
      : {};

    if (!subject) return sendJson(res, 400, { error: 'Objet requis' });
    if (!htmlContent.trim()) return sendJson(res, 400, { error: 'Message (HTML) requis' });

    const whereExtra =
      marketingOptInFilter == null
        ? onlyOptIn
          ? { marketingOptIn: true }
          : {}
        : { marketingOptIn: marketingOptInFilter };

    let recipients;
    if (mode === 'selection') {
      if (contactIds.length === 0) return sendJson(res, 400, { error: 'Aucun contact sélectionné' });
      recipients = await prisma.marketingContact.findMany({
        where: { id: { in: contactIds }, ...whereExtra },
      });
    } else {
      const andParts = [{ ...whereExtra }];
      if (Object.keys(searchWhere).length) andParts.push(searchWhere);
      recipients = await prisma.marketingContact.findMany({ where: { AND: andParts } });
    }

    let sent = 0;
    let failed = 0;
    let skipped = 0;
    for (const r of recipients) {
      const out = await sendBrevoEmail(
        { email: r.emailKey, name: r.displayName || undefined },
        { subject, htmlContent },
      );
      if (out.ok) sent++;
      else if (out.skipped) skipped++;
      else failed++;
      await sleepMs(130);
    }
    return sendJson(res, 200, {
      ok: true,
      sent,
      failed,
      skipped,
      total: recipients.length,
    });
  } catch (e) {
    console.error(e);
    return sendJson(res, 500, { error: e.message || 'Erreur serveur' });
  }
}

/** GET /api/admin/crm/contacts */
export async function adminListMarketingContacts(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: 'Méthode non autorisée' });
  }
  try {
    const auth = await requireAdmin(req);
    if (auth.error) return sendJson(res, auth.status, { error: auth.error });

    const { page, pageSize, q, marketingOptIn } = parseQuery(req);
    const where = {
      ...(q
        ? {
            OR: [
              { emailKey: { contains: q, mode: 'insensitive' } },
              { displayName: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(marketingOptIn == null ? {} : { marketingOptIn }),
    };

    const [total, totalContacts, optInCount, withPhoneCount, rowsAll] = await Promise.all([
      prisma.marketingContact.count({ where }),
      prisma.marketingContact.count(),
      prisma.marketingContact.count({ where: { marketingOptIn: true } }),
      prisma.marketingContact.count({ where: { phone: { not: null } } }),
      prisma.marketingContact.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
    const effectivePage = total === 0 ? 1 : Math.min(page, totalPages);
    const rows =
      effectivePage === page
        ? rowsAll
        : await prisma.marketingContact.findMany({
            where,
            orderBy: { updatedAt: 'desc' },
            skip: (effectivePage - 1) * pageSize,
            take: pageSize,
          });

    const contacts = await Promise.all(
      rows.map(async (c) => {
        const webinarRegistrationCount = await prisma.webinarRegistration.count({
          where: { emailKey: c.emailKey },
        });
        const latestGuestRegistration =
          !c.displayName || !c.phone
            ? await prisma.webinarRegistration.findFirst({
                where: {
                  emailKey: c.emailKey,
                  OR: [{ guestName: { not: null } }, { guestPhone: { not: null } }],
                },
                orderBy: { registeredAt: 'desc' },
                select: { guestName: true, guestPhone: true },
              })
            : null;
        const user = await prisma.user.findUnique({
          where: { email: c.emailKey },
          select: { id: true },
        });
        const hasFormationEnrollment = user
          ? (await prisma.enrollment.count({ where: { userId: user.id } })) > 0
          : false;
        const displayName =
          c.displayName || latestGuestRegistration?.guestName || null;
        const phone = c.phone || latestGuestRegistration?.guestPhone || null;
        return {
          id: c.id,
          email: c.emailKey,
          displayName,
          phone,
          marketingOptIn: c.marketingOptIn,
          webinarRegistrationCount,
          hasFormationEnrollment,
          createdAt: c.createdAt.toISOString(),
          updatedAt: c.updatedAt.toISOString(),
        };
      }),
    );

    return sendJson(res, 200, {
      contacts,
      total,
      page: effectivePage,
      pageSize,
      totalPages,
      totals: {
        total: totalContacts,
        optIn: optInCount,
        withPhone: withPhoneCount,
      },
    });
  } catch (e) {
    console.error(e);
    return sendJson(res, 500, { error: e.message || 'Erreur serveur' });
  }
}
