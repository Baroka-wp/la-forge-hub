import { readJsonBody, sendJson, setCors } from './_lib/http.js';
import { normalizeEmail } from './_lib/email.js';
import { upsertMarketingContact } from './_lib/marketingContacts.js';

/** POST /api/newsletter/optin — opt-in générique pour les alertes webinaires futurs */
export async function newsletterOptin(req, res) {
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
    const email = normalizeEmail(body.email);
    const firstName = String(body.firstName || '').trim();
    const lastName = String(body.lastName || '').trim();

    if (!email || !email.includes('@')) {
      return sendJson(res, 400, { error: 'E-mail invalide.' });
    }

    const displayName = [firstName, lastName].filter(Boolean).join(' ').trim();

    await upsertMarketingContact({
      emailKey: email,
      displayName: displayName || null,
      marketingOptIn: true,
    });

    return sendJson(res, 201, { ok: true });
  } catch (e) {
    console.error(e);
    return sendJson(res, 500, { error: e.message || 'Erreur serveur' });
  }
}
