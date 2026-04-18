import { prisma } from './_lib/prisma.js';
import { isUserAdmin, requireUser } from './_lib/auth.js';
import { sendJson, setCors } from './_lib/http.js';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: 'Méthode non autorisée' });
  }
  try {
    const auth = await requireUser(req);
    if (auth.error) {
      return sendJson(res, auth.status, { error: auth.error });
    }
    const rows = await prisma.enrollment.findMany({
      where: { userId: auth.user.id },
      select: { courseSlug: true },
    });
    return sendJson(res, 200, {
      user: auth.user,
      enrollments: rows.map((r) => r.courseSlug),
      isAdmin: isUserAdmin(auth.user),
    });
  } catch (e) {
    console.error(e);
    return sendJson(res, 500, { error: e.message || 'Erreur serveur' });
  }
}
