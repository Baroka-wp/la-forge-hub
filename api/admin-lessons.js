import { prisma } from './_lib/prisma.js';
import { requireAdmin } from './_lib/auth.js';
import { readJsonBody, sendJson, setCors } from './_lib/http.js';

function youtubeIdOk(id) {
  return typeof id === 'string' && /^[a-zA-Z0-9_-]{6,}$/.test(id.trim());
}

const LESSON_KINDS = new Set(['VIDEO', 'READING', 'EXERCISE', 'QUIZ', 'PROJECT']);

function optionalText(value, maxLength = 100_000) {
  if (value === null || value === undefined || value === '') return null;
  const cleaned = String(value).trim();
  return cleaned && cleaned.length <= maxLength ? cleaned : null;
}

/** POST créer une leçon (position = fin du cours si omis) */
export async function createLesson(req, res) {
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
    const courseSlug = (body.courseSlug || 'formation-ia').trim();
    const title = (body.title || '').trim();
    const kind = String(body.kind || 'VIDEO').toUpperCase();
    const youtubeId = optionalText(body.youtubeId, 200);
    const tag = (body.tag || 'ml').trim();
    let collabUrl = body.collabUrl != null ? String(body.collabUrl).trim() : '';
    collabUrl = collabUrl || null;
    let description = body.description != null ? String(body.description).trim() : '';
    description = description || null;

    if (!title) return sendJson(res, 400, { error: 'title requis' });
    if (!LESSON_KINDS.has(kind)) return sendJson(res, 400, { error: 'kind invalide' });
    if (kind === 'VIDEO' && !youtubeIdOk(youtubeId)) return sendJson(res, 400, { error: 'youtubeId invalide' });
    const durationMin = body.durationMin == null ? null : Number(body.durationMin);
    if (durationMin !== null && (!Number.isInteger(durationMin) || durationMin < 1)) {
      return sendJson(res, 400, { error: 'durationMin invalide' });
    }

    const agg = await prisma.lesson.aggregate({
      where: { courseSlug },
      _max: { position: true },
    });
    const nextPos = (agg._max.position ?? 0) + 1;
    const position = typeof body.position === 'number' ? body.position : nextPos;

    const lessonId =
      (body.lessonId && String(body.lessonId).trim()) || `${courseSlug}-${String(position).padStart(4, '0')}`;

    const existing = await prisma.lesson.findUnique({ where: { lessonId } });
    if (existing) {
      return sendJson(res, 409, { error: 'lessonId déjà utilisé' });
    }

    const row = await prisma.lesson.create({
      data: {
        lessonId,
        courseSlug,
        position,
        title,
        description,
        moduleId: optionalText(body.moduleId, 100),
        kind,
        youtubeId: kind === 'VIDEO' ? youtubeId : null,
        bodyMarkdown: optionalText(body.bodyMarkdown),
        durationMin,
        published: body.published !== false,
        tag,
        collabUrl,
        recordedAt: body.recordedAt ? new Date(body.recordedAt) : null,
      },
    });
    return sendJson(res, 201, { lesson: row });
  } catch (e) {
    console.error(e);
    return sendJson(res, 500, { error: e.message || 'Erreur serveur' });
  }
}

/** PATCH mettre à jour (lien Colab, titre, vidéo, tag, position…) */
export async function patchLesson(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'PATCH') {
    return sendJson(res, 405, { error: 'Méthode non autorisée' });
  }
  try {
    const auth = await requireAdmin(req);
    if (auth.error) return sendJson(res, auth.status, { error: auth.error });
    const lessonId = req.params?.lessonId;
    if (!lessonId) return sendJson(res, 400, { error: 'lessonId manquant' });
    const body = await readJsonBody(req);

    const existing = await prisma.lesson.findUnique({
      where: { lessonId },
      select: { kind: true, youtubeId: true },
    });
    if (!existing) return sendJson(res, 404, { error: 'Leçon introuvable' });

    const data = {};
    if (body.title != null) data.title = String(body.title).trim();
    if (body.youtubeId != null) {
      const y = String(body.youtubeId).trim();
      data.youtubeId = y || null;
    }
    if (body.kind != null) {
      const kind = String(body.kind).toUpperCase();
      if (!LESSON_KINDS.has(kind)) return sendJson(res, 400, { error: 'kind invalide' });
      data.kind = kind;
    }
    if (body.tag != null) data.tag = String(body.tag).trim();
    if (body.position != null) data.position = Number(body.position);
    if ('collabUrl' in body) {
      const c = body.collabUrl != null ? String(body.collabUrl).trim() : '';
      data.collabUrl = c || null;
    }
    if ('description' in body) {
      const d = body.description != null ? String(body.description).trim() : '';
      data.description = d || null;
    }
    if ('moduleId' in body) data.moduleId = optionalText(body.moduleId, 100);
    if ('bodyMarkdown' in body) data.bodyMarkdown = optionalText(body.bodyMarkdown);
    if ('durationMin' in body) {
      const durationMin = body.durationMin == null ? null : Number(body.durationMin);
      if (durationMin !== null && (!Number.isInteger(durationMin) || durationMin < 1)) {
        return sendJson(res, 400, { error: 'durationMin invalide' });
      }
      data.durationMin = durationMin;
    }
    if ('published' in body) {
      if (typeof body.published !== 'boolean') return sendJson(res, 400, { error: 'published invalide' });
      data.published = body.published;
    }
    if (body.recordedAt != null) data.recordedAt = body.recordedAt ? new Date(body.recordedAt) : null;

    if (Object.keys(data).length === 0) {
      return sendJson(res, 400, { error: 'Aucun champ à mettre à jour' });
    }

    const finalKind = data.kind || existing.kind;
    const finalYoutubeId = 'youtubeId' in data ? data.youtubeId : existing.youtubeId;
    if (finalKind === 'VIDEO' && !youtubeIdOk(finalYoutubeId)) {
      return sendJson(res, 400, { error: 'Une leçon vidéo exige un youtubeId valide' });
    }

    const row = await prisma.lesson.update({
      where: { lessonId },
      data,
    });
    return sendJson(res, 200, { lesson: row });
  } catch (e) {
    if (e.code === 'P2025') {
      return sendJson(res, 404, { error: 'Leçon introuvable' });
    }
    console.error(e);
    return sendJson(res, 500, { error: e.message || 'Erreur serveur' });
  }
}

/** DELETE supprimer une leçon */
export async function deleteLesson(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'DELETE') {
    return sendJson(res, 405, { error: 'Méthode non autorisée' });
  }
  try {
    const auth = await requireAdmin(req);
    if (auth.error) return sendJson(res, auth.status, { error: auth.error });
    const lessonId = req.params?.lessonId;
    if (!lessonId) return sendJson(res, 400, { error: 'lessonId manquant' });

    await prisma.lesson.delete({ where: { lessonId } });
    return sendJson(res, 200, { ok: true });
  } catch (e) {
    if (e.code === 'P2025') {
      return sendJson(res, 404, { error: 'Leçon introuvable' });
    }
    console.error(e);
    return sendJson(res, 500, { error: e.message || 'Erreur serveur' });
  }
}
