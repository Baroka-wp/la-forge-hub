import { prisma } from './_lib/prisma.js';
import { requireUser } from './_lib/auth.js';
import { readJsonBody, sendJson, setCors } from './_lib/http.js';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'PATCH') {
    return sendJson(res, 405, { error: 'Méthode non autorisée' });
  }
  try {
    const auth = await requireUser(req);
    if (auth.error) {
      return sendJson(res, auth.status, { error: auth.error });
    }
    const body = await readJsonBody(req);
    const data = {};
    if ('displayName' in body) {
      const displayName = String(body.displayName || '').trim();
      if (!displayName) return sendJson(res, 400, { error: 'Nom affiché requis' });
      data.displayName = displayName;
    }
    if ('segment' in body) {
      const segment = body.segment == null || body.segment === '' ? null : String(body.segment).toUpperCase();
      if (segment !== null && segment !== 'COLLEGE' && segment !== 'LYCEE') {
        return sendJson(res, 400, { error: 'Niveau scolaire invalide' });
      }
      data.segment = segment;
    }
    if ('birthYear' in body) {
      const birthYear = body.birthYear == null || body.birthYear === '' ? null : Number(body.birthYear);
      const currentYear = new Date().getFullYear();
      if (birthYear !== null && (!Number.isInteger(birthYear) || birthYear < currentYear - 100 || birthYear > currentYear)) {
        return sendJson(res, 400, { error: 'Année de naissance invalide' });
      }
      data.birthYear = birthYear;
    }
    if (!Object.keys(data).length) return sendJson(res, 400, { error: 'Aucun champ à mettre à jour' });
    const user = await prisma.user.update({
      where: { id: auth.user.id },
      data,
      select: { id: true, email: true, displayName: true, role: true, segment: true, birthYear: true },
    });
    return sendJson(res, 200, { user });
  } catch (e) {
    console.error(e);
    return sendJson(res, 500, { error: e.message || 'Erreur serveur' });
  }
}
