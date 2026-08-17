import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { prisma } from './_lib/prisma.js';
import { readJsonBody, sendJson, setCors } from './_lib/http.js';

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
    const token = String(body.token || '').trim();
    const password = String(body.password || '');
    if (!/^[a-f0-9]{64}$/i.test(token)) return sendJson(res, 400, { error: 'Lien invalide ou expiré' });
    if (password.length < 8) {
      return sendJson(res, 400, { error: 'Le mot de passe doit contenir au moins 8 caractères' });
    }

    const hash = tokenHash(token);
    const passwordHash = await bcrypt.hash(password, 10);
    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
      const resetToken = await tx.passwordResetToken.findUnique({ where: { tokenHash: hash } });
      if (!resetToken || resetToken.usedAt || resetToken.expiresAt <= now) return false;

      const claimed = await tx.passwordResetToken.updateMany({
        where: { id: resetToken.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (claimed.count !== 1) return false;

      await tx.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash, authVersion: { increment: 1 } },
      });
      await tx.passwordResetToken.updateMany({
        where: { userId: resetToken.userId, usedAt: null },
        data: { usedAt: now },
      });
      return true;
    });

    if (!result) return sendJson(res, 400, { error: 'Lien invalide ou expiré' });
    return sendJson(res, 200, { message: 'Votre mot de passe a été modifié.' });
  } catch (error) {
    console.error('[password-reset]', error);
    return sendJson(res, 500, { error: 'Une erreur est survenue. Réessayez plus tard.' });
  }
}
