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
    const displayName = String(body.displayName || '').trim();
    if (!displayName) {
      return sendJson(res, 400, { error: 'Nom affiché requis' });
    }
    const user = await prisma.user.update({
      where: { id: auth.user.id },
      data: { displayName },
      select: { id: true, email: true, displayName: true },
    });
    return sendJson(res, 200, { user });
  } catch (e) {
    console.error(e);
    return sendJson(res, 500, { error: e.message || 'Erreur serveur' });
  }
}
