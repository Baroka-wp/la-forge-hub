/**
 * @typedef {{ email: string, name?: string }} BrevoRecipient
 */

const BREVO_API = 'https://api.brevo.com/v3/smtp/email';

function isConfigured() {
  return !!process.env.BREVO_API_KEY && !!process.env.BREVO_SENDER_EMAIL;
}

function sender() {
  const email = String(process.env.BREVO_SENDER_EMAIL || '').trim();
  const name = String(process.env.BREVO_SENDER_NAME || 'La Forge Hub').trim();
  return { email, name };
}

/**
 * @param {BrevoRecipient} to
 * @param {{ subject: string, htmlContent: string, textContent?: string }} body
 */
export async function sendBrevoEmail(to, { subject, htmlContent, textContent }) {
  if (!isConfigured()) {
    console.warn('[brevo] BREVO_API_KEY ou BREVO_SENDER_EMAIL manquant — e-mail non envoyé.');
    return { ok: false, skipped: true };
  }
  const { email, name } = sender();
  if (!email || !to?.email) return { ok: false, error: 'sender ou destinataire manquant' };

  const res = await fetch(BREVO_API, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'api-key': process.env.BREVO_API_KEY,
    },
    body: JSON.stringify({
      sender: { name, email },
      to: [{ email: to.email, name: to.name || '' }],
      subject,
      htmlContent,
      textContent: textContent || htmlContent.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    console.error('[brevo]', res.status, errText);
    return { ok: false, error: errText || `HTTP ${res.status}` };
  }
  return { ok: true };
}

export function publicAppUrl() {
  const u = String(process.env.APP_PUBLIC_URL || process.env.VITE_APP_PUBLIC_URL || '').trim();
  if (u) return u.replace(/\/$/, '');
  return '';
}

function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** @param {import('@prisma/client').Webinar} w */
export function webinarDetailPath(w) {
  const base = publicAppUrl();
  const path = `/webinars/${w.id}`;
  return base ? `${base}${path}` : path;
}

/**
 * @param {import('@prisma/client').Webinar} w
 * @param {{ whenLabel: string, locationLabel: string }} ctx
 */
export function buildWebinarConfirmationEmail(w, { whenLabel, locationLabel }) {
  const title = escHtml(w.title);
  const desc = escHtml(w.description).replace(/\n/g, '<br/>');
  const link = webinarDetailPath(w);
  const linkHtml = publicAppUrl()
    ? `<p><a href="${escHtml(link)}">${escHtml(link)}</a></p>`
    : `<p>${escHtml(link)}</p>`;
  const online =
    w.locationType === 'ONLINE' && w.onlineLink
      ? `<p><strong>Lien de connexion :</strong> <a href="${escHtml(w.onlineLink)}">${escHtml(w.onlineLink)}</a></p>`
      : '';
  const html = `
<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body style="font-family:system-ui,sans-serif;max-width:560px;line-height:1.5;color:#222">
  <h1 style="font-size:1.25rem">Inscription confirmée</h1>
  <p>Vous êtes bien inscrit·e au webinaire suivant :</p>
  <h2 style="font-size:1.1rem;margin:0.5rem 0">${title}</h2>
  <p><strong>Date :</strong> ${escHtml(whenLabel)}<br/><strong>Lieu :</strong> ${escHtml(locationLabel)}</p>
  ${online}
  <div style="margin:1rem 0;padding:0.75rem;background:#f5f7fa;border-radius:8px">${desc}</div>
  <p>${linkHtml}</p>
  <p style="font-size:0.85rem;color:#666">La Forge Hub</p>
</body></html>`;
  return {
    subject: `Inscription confirmée — ${w.title}`,
    htmlContent: html,
  };
}

/**
 * @param {import('@prisma/client').Webinar} w
 * @param {{ whenLabel: string, locationLabel: string }} ctx
 */
export function buildNewWebinarBroadcastEmail(w, { whenLabel, locationLabel }) {
  const title = escHtml(w.title);
  const path = `/webinars/${w.id}`;
  const base = publicAppUrl();
  const href = base ? `${base}${path}` : path;
  const html = `
<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body style="font-family:system-ui,sans-serif;max-width:560px;line-height:1.5;color:#222">
  <h1 style="font-size:1.25rem">Nouveau webinaire La Forge Hub</h1>
  <h2 style="font-size:1.1rem;margin:0.5rem 0">${title}</h2>
  <p><strong>Quand :</strong> ${escHtml(whenLabel)}<br/><strong>Où :</strong> ${escHtml(locationLabel)}</p>
  <p><a href="${escHtml(href)}" style="display:inline-block;padding:10px 18px;background:#2444eb;color:#fff;text-decoration:none;border-radius:8px">Voir le webinaire</a></p>
  <p style="font-size:0.85rem;color:#666">Vous recevez ce message car vous avez accepté les annonces de La Forge Hub.</p>
</body></html>`;
  return {
    subject: `Nouveau webinaire — ${w.title}`,
    htmlContent: html,
  };
}

/**
 * @param {import('@prisma/client').Webinar} w
 */
export function buildReplayAvailableEmail(w) {
  const title = escHtml(w.title);
  const path = `/webinars/${w.id}`;
  const base = publicAppUrl();
  const href = base ? `${base}${path}` : path;
  const html = `
<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body style="font-family:system-ui,sans-serif;max-width:560px;line-height:1.5;color:#222">
  <h1 style="font-size:1.25rem">Replay disponible</h1>
  <p>Le replay est en ligne :</p>
  <h2 style="font-size:1.1rem;margin:0.5rem 0">${title}</h2>
  <p><a href="${escHtml(href)}" style="display:inline-block;padding:10px 18px;background:#2444eb;color:#fff;text-decoration:none;border-radius:8px">Voir le replay</a></p>
  <p style="font-size:0.85rem;color:#666">La Forge Hub — vous vous êtes inscrit·e aux annonces.</p>
</body></html>`;
  return {
    subject: `Replay disponible — ${w.title}`,
    htmlContent: html,
  };
}

/**
 * @param {import('@prisma/client').Webinar} w
 */
export function buildAdminWebinarCreatedEmail(w) {
  const title = escHtml(w.title);
  const admin = String(process.env.BREVO_ADMIN_EMAIL || '').trim();
  if (!admin) return null;
  const link = webinarDetailPath(w);
  const html = `
<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body style="font-family:system-ui,sans-serif;max-width:560px;line-height:1.5;color:#222">
  <p>Un nouveau webinaire a été créé : <strong>${title}</strong></p>
  <p><a href="${escHtml(link)}">${escHtml(link)}</a></p>
</body></html>`;
  return {
    to: { email: admin, name: 'Admin' },
    subject: `[La Forge Hub] Webinaire créé — ${w.title}`,
    htmlContent: html,
  };
}

/**
 * @param {import('@prisma/client').Webinar} w
 * @param {{ whenLabel: string, locationLabel: string }} ctx
 */
export function webinarEmailLabels(w) {
  const whenLabel =
    w.startsAt != null
      ? new Date(w.startsAt).toLocaleString('fr-FR', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : 'À définir';
  let locationLabel = '';
  if (w.locationType === 'ONLINE') locationLabel = 'En ligne';
  else if (w.locationType === 'ONSITE') locationLabel = w.venue ? `Présentiel · ${w.venue}` : 'Présentiel';
  else locationLabel = '—';
  return { whenLabel, locationLabel };
}
