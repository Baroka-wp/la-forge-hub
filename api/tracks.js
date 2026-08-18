import { prisma } from './_lib/prisma.js';
import { sendJson, setCors } from './_lib/http.js';

const SEGMENTS = new Set(['COLLEGE', 'LYCEE']);
const DISCIPLINES = new Set(['PYTHON', 'MATH', 'ML', 'DEEP', 'NLP', 'SOFT']);

export async function listTracks(req, res) {
  setCors(res);
  try {
    const segment = String(req.query?.segment || '').toUpperCase();
    const discipline = String(req.query?.discipline || '').toUpperCase();
    if (segment && !SEGMENTS.has(segment)) return sendJson(res, 400, { error: 'Segment invalide' });
    if (discipline && !DISCIPLINES.has(discipline)) return sendJson(res, 400, { error: 'Discipline invalide' });

    const rows = await prisma.track.findMany({
      where: { published: true, ...(segment ? { segment } : {}), ...(discipline ? { discipline } : {}) },
      orderBy: { position: 'asc' },
      select: {
        slug: true, title: true, summary: true, discipline: true, segment: true, position: true,
        modules: {
          where: { published: true },
          select: { _count: { select: { lessons: { where: { published: true } } } } },
        },
      },
    });
    const tracks = rows.map(({ modules, ...track }) => ({
      ...track,
      moduleCount: modules.length,
      lessonCount: modules.reduce((sum, module) => sum + module._count.lessons, 0),
    }));
    return sendJson(res, 200, { tracks, count: tracks.length });
  } catch (error) {
    console.error('[tracks:list]', error);
    return sendJson(res, 500, { error: 'Erreur serveur' });
  }
}

export async function getTrack(req, res) {
  setCors(res);
  try {
    const slug = String(req.params?.slug || '').trim();
    const track = await prisma.track.findFirst({
      where: { slug, published: true },
      select: {
        slug: true, title: true, summary: true, discipline: true, segment: true, position: true,
        prerequisite: { where: { published: true }, select: { slug: true, title: true } },
        modules: {
          where: { published: true },
          orderBy: { position: 'asc' },
          select: {
            id: true, title: true, summary: true, position: true,
            lessons: {
              where: { published: true },
              orderBy: { position: 'asc' },
              select: {
                lessonId: true, title: true, description: true, position: true, kind: true,
                durationMin: true, tag: true,
              },
            },
          },
        },
      },
    });
    if (!track) return sendJson(res, 404, { error: 'Parcours introuvable' });
    return sendJson(res, 200, { track });
  } catch (error) {
    console.error('[tracks:get]', error);
    return sendJson(res, 500, { error: 'Erreur serveur' });
  }
}
