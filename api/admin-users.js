import { prisma } from './_lib/prisma.js';
import { requireAdmin } from './_lib/auth.js';
import { readJsonBody, sendJson, setCors } from './_lib/http.js';

function setAdminCors(res) {
  setCors(res);
}

/** GET /api/admin/overview — compteurs rapides */
export async function overview(req, res) {
  setAdminCors(res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: 'Méthode non autorisée' });
  }
  try {
    const auth = await requireAdmin(req);
    if (auth.error) return sendJson(res, auth.status, { error: auth.error });
    const [userCount, lessonCount, adminCount] = await Promise.all([
      prisma.user.count(),
      prisma.lesson.count({ where: { courseSlug: 'formation-ia' } }),
      prisma.user.count({ where: { role: 'admin' } }),
    ]);
    return sendJson(res, 200, { userCount, lessonCount, adminCount });
  } catch (e) {
    console.error(e);
    return sendJson(res, 500, { error: e.message || 'Erreur serveur' });
  }
}

/** GET /api/admin/users */
export async function listUsers(req, res) {
  setAdminCors(res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: 'Méthode non autorisée' });
  }
  try {
    const auth = await requireAdmin(req);
    if (auth.error) return sendJson(res, auth.status, { error: auth.error });
    const rows = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        createdAt: true,
        _count: { select: { enrollments: true, lessonProgress: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    const users = rows.map((r) => ({
      id: r.id,
      email: r.email,
      displayName: r.displayName,
      role: r.role,
      createdAt: r.createdAt.toISOString(),
      enrollments: r._count.enrollments,
      progressRows: r._count.lessonProgress,
    }));
    return sendJson(res, 200, { users });
  } catch (e) {
    console.error(e);
    return sendJson(res, 500, { error: e.message || 'Erreur serveur' });
  }
}

/** PATCH /api/admin/users/:userId — role uniquement */
export async function patchUser(req, res) {
  setAdminCors(res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'PATCH') {
    return sendJson(res, 405, { error: 'Méthode non autorisée' });
  }
  try {
    const auth = await requireAdmin(req);
    if (auth.error) return sendJson(res, auth.status, { error: auth.error });
    const userId = req.params?.userId;
    if (!userId) return sendJson(res, 400, { error: 'userId manquant' });
    const body = await readJsonBody(req);
    const role = body.role;
    if (role !== 'learner' && role !== 'admin') {
      return sendJson(res, 400, { error: 'role doit être learner ou admin' });
    }

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });
    if (!target) return sendJson(res, 404, { error: 'Utilisateur introuvable' });

    if (target.role === 'admin' && role === 'learner') {
      const adminCount = await prisma.user.count({ where: { role: 'admin' } });
      if (adminCount <= 1) {
        return sendJson(res, 400, {
          error: 'Impossible de retirer le dernier administrateur du système.',
        });
      }
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { role },
      select: { id: true, email: true, displayName: true, role: true, createdAt: true },
    });
    return sendJson(res, 200, {
      user: {
        ...updated,
        createdAt: updated.createdAt.toISOString(),
      },
    });
  } catch (e) {
    console.error(e);
    return sendJson(res, 500, { error: e.message || 'Erreur serveur' });
  }
}
