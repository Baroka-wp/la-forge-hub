import { prisma } from './_lib/prisma.js';
import { requireUser } from './_lib/auth.js';
import { readJsonBody, sendJson, setCors } from './_lib/http.js';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  try {
    const auth = await requireUser(req);
    if (auth.error) {
      return sendJson(res, auth.status, { error: auth.error });
    }
    if (req.method === 'GET') {
      /** originalUrl conserve la query ; req.url peut être tronqué par le middleware /api. */
      const raw = String(req.originalUrl || req.url || '');
      const q = raw.includes('?') ? raw.split('?').slice(1).join('?') : '';
      const params = new URLSearchParams(q);
      const lessonId = params.get('lesson_id') || params.get('lessonId');
      if (!lessonId) {
        return sendJson(res, 400, { error: 'lesson_id requis' });
      }
      const rows = await prisma.communityPost.findMany({
        where: { lessonId },
        orderBy: { createdAt: 'asc' },
        include: {
          user: { select: { displayName: true } },
        },
      });
      const posts = rows.map((r) => ({
        id: r.id,
        body: r.body,
        created_at: r.createdAt.toISOString(),
        parent_id: r.parentId,
        user_id: r.userId,
        display_name: r.user.displayName,
      }));
      return sendJson(res, 200, { posts });
    }
    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      const lessonId = String(body.lesson_id || body.lessonId || '').trim();
      const text = String(body.body || '').trim();
      const parentId = body.parent_id || body.parentId || null;
      if (!lessonId || !text) {
        return sendJson(res, 400, { error: 'lesson_id et body requis' });
      }
      await prisma.communityPost.create({
        data: {
          lessonId,
          userId: auth.user.id,
          body: text,
          parentId: parentId || null,
        },
      });
      return sendJson(res, 201, { ok: true });
    }
    return sendJson(res, 405, { error: 'Méthode non autorisée' });
  } catch (e) {
    console.error(e);
    return sendJson(res, 500, { error: e.message || 'Erreur serveur' });
  }
}
