import { prisma } from './_lib/prisma.js';
import { sendJson, setCors } from './_lib/http.js';

/**
 * GET /api/lessons?course=formation-ia
 * Catalogue pour le front (Neon). Si la table est vide, le client retombe sur seed-data.js.
 */
export default async function lessonsHandler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: 'Méthode non autorisée' });
  }
  try {
    const q = (req.originalUrl || req.url || '').split('?')[1] || '';
    const params = new URLSearchParams(q);
    const course = String(req.query?.course || params.get('course') || 'formation-ia');
    const rows = await prisma.lesson.findMany({
      where: {
        courseSlug: course,
        published: true,
        OR: [
          { moduleId: null },
          { module: { is: { published: true, track: { published: true } } } },
        ],
      },
      orderBy: { position: 'asc' },
    });
    const lessons = rows.map((r) => ({
      lessonId: r.lessonId,
      courseSlug: r.courseSlug,
      position: r.position,
      title: r.title,
      description: r.description ?? null,
      youtubeId: r.youtubeId,
      kind: r.kind,
      moduleId: r.moduleId,
      durationMin: r.durationMin,
      published: r.published,
      bodyMarkdown: r.bodyMarkdown,
      tag: r.tag,
      url: r.youtubeId ? `https://youtu.be/${r.youtubeId}` : null,
      recordedAt: r.recordedAt ? r.recordedAt.toISOString() : null,
      collabUrl: r.collabUrl || null,
    }));
    return sendJson(res, 200, { lessons, count: lessons.length });
  } catch (e) {
    console.error(e);
    return sendJson(res, 500, { error: e.message || 'Erreur serveur' });
  }
}
