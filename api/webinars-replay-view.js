import { prisma } from './_lib/prisma.js';
import { readJsonBody, sendJson, setCors } from './_lib/http.js';

/**
 * POST /api/webinars/:id/replay-view
 * Enregistre une "vue" unique (par navigateur) d’un replay.
 */
export async function trackReplayView(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Méthode non autorisée' });
  }
  try {
    const webinarId = String(req.params?.id || '').trim();
    const body = await readJsonBody(req);
    const viewerKey = String(body.viewerKey || '').trim().slice(0, 120);

    if (!webinarId) return sendJson(res, 400, { error: 'id manquant' });
    if (!viewerKey) return sendJson(res, 400, { error: 'viewerKey requis' });

    const webinar = await prisma.webinar.findUnique({
      where: { id: webinarId },
      select: { id: true, published: true, kind: true, recordingUrl: true },
    });
    const hasReplay = webinar?.kind === 'ARCHIVE' || !!(webinar?.recordingUrl && String(webinar.recordingUrl).trim());
    if (!webinar || !webinar.published || !hasReplay) {
      return sendJson(res, 404, { error: 'Replay introuvable' });
    }

    await prisma.webinarReplayView.create({
      data: { webinarId, viewerKey },
    });

    return sendJson(res, 201, { ok: true });
  } catch (e) {
    if (e?.code === 'P2002') {
      // déjà vu (unique webinarId+viewerKey)
      return sendJson(res, 200, { ok: true });
    }
    console.error(e);
    return sendJson(res, 500, { error: e.message || 'Erreur serveur' });
  }
}

