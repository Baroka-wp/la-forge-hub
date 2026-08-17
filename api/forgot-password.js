import crypto from 'node:crypto';
import { prisma } from './_lib/prisma.js';
import { publicAppUrl, sendBrevoEmail } from './_lib/brevo.js';
import { readJsonBody, sendJson, setCors } from './_lib/http.js';

const GENERIC_MESSAGE =
  'Si un compte correspond à cette adresse, un lien de réinitialisation vient de vous être envoyé.';

function tokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Méthode non autorisée' });

  try {
    const body = await readJsonBody(req);
    const email = String(body.email || '').trim().toLowerCase();
    if (!email || !email.includes('@')) return sendJson(res, 400, { error: 'Adresse e-mail invalide' });

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return sendJson(res, 200, { message: GENERIC_MESSAGE });

    const recentRequest = await prisma.passwordResetToken.findFirst({
      where: {
        userId: user.id,
        createdAt: { gt: new Date(Date.now() - 2 * 60 * 1000) },
      },
      select: { id: true },
    });
    if (recentRequest) return sendJson(res, 200, { message: GENERIC_MESSAGE });

    const rawToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    const baseUrl = publicAppUrl();

    if (!baseUrl) {
      console.error('[password-reset] APP_PUBLIC_URL manquant — lien non envoyé.');
      return sendJson(res, 200, { message: GENERIC_MESSAGE });
    }

    await prisma.$transaction([
      prisma.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      }),
      prisma.passwordResetToken.create({
        data: { userId: user.id, tokenHash: tokenHash(rawToken), expiresAt },
      }),
    ]);

    const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(rawToken)}`;
    const emailResult = await sendBrevoEmail(
      { email: user.email, name: user.displayName },
      {
        subject: 'Réinitialisez votre mot de passe — La Forge Hub',
        htmlContent: `<!doctype html><html><body style="font-family:Arial,sans-serif;max-width:560px;line-height:1.55;color:#222">
          <h1 style="font-size:1.25rem">Réinitialisation du mot de passe</h1>
          <p>Bonjour ${escapeHtml(user.displayName)},</p>
          <p>Vous avez demandé à changer le mot de passe de votre compte La Forge Hub.</p>
          <p><a href="${escapeHtml(resetUrl)}" style="display:inline-block;padding:11px 18px;background:#2444eb;color:#fff;text-decoration:none;border-radius:8px">Choisir un nouveau mot de passe</a></p>
          <p>Ce lien est valable pendant 30 minutes et ne peut être utilisé qu’une seule fois.</p>
          <p style="font-size:.9rem;color:#666">Si vous n’êtes pas à l’origine de cette demande, ignorez simplement cet e-mail.</p>
        </body></html>`,
        textContent: `Réinitialisez votre mot de passe La Forge Hub : ${resetUrl}\n\nCe lien est valable pendant 30 minutes.`,
      },
    );

    if (!emailResult.ok) console.error('[password-reset] Échec de l’envoi pour', user.id);
    return sendJson(res, 200, { message: GENERIC_MESSAGE });
  } catch (error) {
    console.error('[password-reset]', error);
    return sendJson(res, 500, { error: 'Une erreur est survenue. Réessayez plus tard.' });
  }
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
