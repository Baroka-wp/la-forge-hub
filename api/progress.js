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
      const rows = await prisma.lessonProgress.findMany({
        where: { userId: auth.user.id },
      });
      const map = {};
      rows.forEach((row) => {
        map[row.lessonId] = {
          completed: row.completed,
          last_position_sec: row.lastPositionSec,
        };
      });
      return sendJson(res, 200, { map });
    }
    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      const lessonId = String(body.lesson_id || body.lessonId || '').trim();
      if (!lessonId) {
        return sendJson(res, 400, { error: 'lesson_id requis' });
      }
      const existing = await prisma.lessonProgress.findUnique({
        where: { userId_lessonId: { userId: auth.user.id, lessonId } },
      });
      const completed =
        body.completed !== undefined ? !!body.completed : (existing?.completed ?? false);
      const lastPositionSec =
        body.last_position_sec !== undefined
          ? Math.max(0, parseInt(String(body.last_position_sec), 10) || 0)
          : (existing?.lastPositionSec ?? 0);

      await prisma.lessonProgress.upsert({
        where: { userId_lessonId: { userId: auth.user.id, lessonId } },
        create: {
          userId: auth.user.id,
          lessonId,
          completed,
          lastPositionSec,
        },
        update: { completed, lastPositionSec },
      });
      return sendJson(res, 200, { ok: true });
    }
    return sendJson(res, 405, { error: 'Méthode non autorisée' });
  } catch (e) {
    console.error(e);
    return sendJson(res, 500, { error: e.message || 'Erreur serveur' });
  }
}
