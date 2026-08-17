import { readJsonBody, sendJson, setCors } from './_lib/http.js';
import { sendBrevoEmail } from './_lib/brevo.js';
import { checkCertificateLookupRateLimit } from './_lib/certificateRateLimit.js';

const SUPPORT_EMAIL = 'birotori@gmail.com';

function esc(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value || '').trim());
}

export default async function attestationsSupport(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Méthode non autorisée' });

  try {
    const rateLimit = await checkCertificateLookupRateLimit(req, { namespace: 'support', maxRequests: 3 });
    if (!rateLimit.allowed) {
      res.setHeader('Retry-After', String(rateLimit.retryAfterSeconds));
      return sendJson(res, 429, { error: 'Trop de messages. Patientez quelques minutes avant de réessayer.' });
    }

    const body = await readJsonBody(req);
    if (body.website) return sendJson(res, 200, { ok: true });

    const tableNumber = String(body.tableNumber || '').trim().slice(0, 60);
    const fullName = String(body.fullName || '').trim().slice(0, 160);
    const email = String(body.email || '').trim().toLowerCase().slice(0, 160);
    const phone = String(body.phone || '').trim().slice(0, 40);
    const message = String(body.message || '').trim().slice(0, 2000);

    if (!tableNumber || !fullName || !email || !phone || !message) {
      return sendJson(res, 400, { error: 'Tous les champs sont obligatoires.' });
    }
    if (!isEmail(email)) return sendJson(res, 400, { error: 'Adresse e-mail invalide.' });

    const subject = `Assistance attestation — ${tableNumber}`;
    const htmlContent = `
      <h1 style="font-size:20px">Demande d’assistance — attestation</h1>
      <p><strong>Numéro de table :</strong> ${esc(tableNumber)}<br>
      <strong>Nom :</strong> ${esc(fullName)}<br>
      <strong>E-mail :</strong> ${esc(email)}<br>
      <strong>Téléphone :</strong> ${esc(phone)}</p>
      <p><strong>Message :</strong></p>
      <p style="white-space:pre-wrap">${esc(message)}</p>`;
    const result = await sendBrevoEmail(
      { email: SUPPORT_EMAIL, name: 'Administration La Forge Hub' },
      { subject, htmlContent },
    );
    if (!result.ok) return sendJson(res, 502, { error: "Le message n'a pas pu être envoyé. Réessayez." });
    return sendJson(res, 200, { ok: true });
  } catch (error) {
    console.error('[attestations-support]', error);
    return sendJson(res, 500, { error: 'Erreur serveur. Réessayez dans un instant.' });
  }
}
