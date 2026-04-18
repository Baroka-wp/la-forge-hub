import { prisma } from './_lib/prisma.js';
import { requireUser } from './_lib/auth.js';
import { readJsonBody, sendJson, setCors } from './_lib/http.js';
import { syncUserMarketingPreference } from './_lib/marketingContacts.js';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Méthode non autorisée' });
  }
  try {
    const auth = await requireUser(req);
    if (auth.error) {
      return sendJson(res, auth.status, { error: auth.error });
    }
    const body = await readJsonBody(req);
    const courseSlug = String(body.courseSlug || body.course_slug || 'formation-ia').trim() || 'formation-ia';
    const marketingOptIn =
      body.marketingOptIn === true || body.marketingOptIn === 'true' || body.marketingOptIn === 1;
    try {
      await prisma.enrollment.create({
        data: { userId: auth.user.id, courseSlug },
      });
    } catch (e) {
      if (e.code !== 'P2002') throw e;
    }
    await syncUserMarketingPreference(auth.user.id, marketingOptIn);
    const rows = await prisma.enrollment.findMany({
      where: { userId: auth.user.id },
      select: { courseSlug: true },
    });
    return sendJson(res, 200, { ok: true, enrollments: rows.map((r) => r.courseSlug) });
  } catch (e) {
    console.error(e);
    return sendJson(res, 500, { error: e.message || 'Erreur serveur' });
  }
}
