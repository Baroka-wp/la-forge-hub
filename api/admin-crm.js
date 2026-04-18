import { prisma } from './_lib/prisma.js';
import { requireAdmin } from './_lib/auth.js';
import { sendJson, setCors } from './_lib/http.js';

function parseQuery(req) {
  const raw = String(req.originalUrl || req.url || '');
  const qStr = raw.includes('?') ? raw.split('?').slice(1).join('?') : '';
  const params = new URLSearchParams(qStr);
  let page = Math.max(1, parseInt(String(params.get('page') || '1'), 10) || 1);
  let pageSize = Math.min(100, Math.max(5, parseInt(String(params.get('pageSize') || '25'), 10) || 25));
  const q = String(params.get('q') || '').trim().toLowerCase().slice(0, 200);
  return { page, pageSize, q };
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

    const { page, pageSize, q } = parseQuery(req);
    const where = q
      ? {
          OR: [
            { emailKey: { contains: q, mode: 'insensitive' } },
            { displayName: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {};

    const [total, rows] = await Promise.all([
      prisma.marketingContact.count({ where }),
      prisma.marketingContact.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
    const effectivePage = total === 0 ? 1 : Math.min(page, totalPages);

    const contacts = await Promise.all(
      rows.map(async (c) => {
        const webinarRegistrationCount = await prisma.webinarRegistration.count({
          where: { emailKey: c.emailKey },
        });
        const user = await prisma.user.findUnique({
          where: { email: c.emailKey },
          select: { id: true },
        });
        const hasFormationEnrollment = user
          ? (await prisma.enrollment.count({ where: { userId: user.id } })) > 0
          : false;
        return {
          id: c.id,
          email: c.emailKey,
          displayName: c.displayName,
          phone: c.phone,
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
    });
  } catch (e) {
    console.error(e);
    return sendJson(res, 500, { error: e.message || 'Erreur serveur' });
  }
}
