import bcrypt from 'bcryptjs';
import { prisma } from './_lib/prisma.js';
import { signToken } from './_lib/jwt.js';
import { readJsonBody, sendJson, setCors } from './_lib/http.js';

export default async function handler(req, res) {
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
    const email = String(body.email || '')
      .trim()
      .toLowerCase();
    const password = String(body.password || '');
    const displayName = String(body.displayName || '').trim() || email.split('@')[0];
    if (!email || !password) {
      return sendJson(res, 400, { error: 'E-mail et mot de passe requis' });
    }
    if (password.length < 6) {
      return sendJson(res, 400, { error: 'Le mot de passe doit contenir au moins 6 caractères' });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { email, passwordHash, displayName },
      select: { id: true, email: true, displayName: true, role: true },
    });
    const token = signToken({ sub: user.id, email: user.email });
    return sendJson(res, 201, { token, user });
  } catch (e) {
    if (e.code === 'P2002') {
      return sendJson(res, 409, { error: 'Cette adresse e-mail est déjà utilisée' });
    }
    console.error(e);
    return sendJson(res, 500, { error: e.message || 'Erreur serveur' });
  }
}
