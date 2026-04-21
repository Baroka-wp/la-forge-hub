import { prisma } from './_lib/prisma.js';
import { readJsonBody, sendJson, setCors } from './_lib/http.js';
import { normalizeEmail } from './_lib/email.js';
import { upsertMarketingContact } from './_lib/marketingContacts.js';

function hasReplayAvailable(webinar) {
  if (!webinar) return false;
  if (webinar.kind === 'ARCHIVE') return true;
  if (webinar.recordingUrl && String(webinar.recordingUrl).trim()) return true;
  return false;
}

/** POST /api/webinars/replay-optin */
export async function replayOptin(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Méthode non autorisée' });
  }
  try {
    const body = await readJsonBody(req);
    const webinarId = String(body.webinarId || '').trim();
    const email = normalizeEmail(body.email);
    const fullName = String(body.fullName || '').trim();

    if (!webinarId) return sendJson(res, 400, { error: 'webinarId requis' });
    if (!email || !email.includes('@')) {
      return sendJson(res, 400, { error: 'E-mail invalide.' });
    }

    const webinar = await prisma.webinar.findUnique({ where: { id: webinarId } });
    if (!webinar || !webinar.published || !hasReplayAvailable(webinar)) {
      return sendJson(res, 404, { error: 'Replay introuvable pour ce webinaire.' });
    }

    await upsertMarketingContact({
      emailKey: email,
      displayName: fullName || null,
      phone: null,
      marketingOptIn: true,
    });

    return sendJson(res, 201, { ok: true });
  } catch (e) {
    console.error(e);
    return sendJson(res, 500, { error: e.message || 'Erreur serveur' });
  }
}
