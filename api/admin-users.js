import { prisma } from './_lib/prisma.js';
import { requireAdmin } from './_lib/auth.js';
import { readJsonBody, sendJson, setCors } from './_lib/http.js';

function setAdminCors(res) {
  setCors(res);
}

function normalizeEmail(v) {
  return String(v || '').trim().toLowerCase();
}

function parseListUsersQuery(req) {
  const raw = String(req.originalUrl || req.url || '');
  const qStr = raw.includes('?') ? raw.split('?').slice(1).join('?') : '';
  const params = new URLSearchParams(qStr);
  const q = String(params.get('q') || '').trim().slice(0, 200);
  const roleRaw = String(params.get('role') || '').trim();
  const role = roleRaw === 'admin' || roleRaw === 'learner' ? roleRaw : '';
  const page = Math.max(1, parseInt(String(params.get('page') || '1'), 10) || 1);
  const pageSize = Math.min(100, Math.max(10, parseInt(String(params.get('pageSize') || '25'), 10) || 25));
  return { q, role, page, pageSize };
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
    const { q, role, page, pageSize } = parseListUsersQuery(req);
    const where = {
      ...(role ? { role } : {}),
      ...(q
        ? {
            OR: [
              { email: { contains: q, mode: 'insensitive' } },
              { displayName: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [total, totalUsers, adminCount, learnerCount, createdLast30d] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.count(),
      prisma.user.count({ where: { role: 'admin' } }),
      prisma.user.count({ where: { role: 'learner' } }),
      prisma.user.count({
        where: { createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
      }),
    ]);
    const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
    const safePage = Math.min(page, totalPages);
    const rows = await prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        createdAt: true,
        _count: { select: { enrollments: true, lessonProgress: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (safePage - 1) * pageSize,
      take: pageSize,
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
    return sendJson(res, 200, {
      users,
      total,
      page: total === 0 ? 1 : safePage,
      pageSize,
      totalPages,
      totals: {
        total: totalUsers,
        admins: adminCount,
        learners: learnerCount,
        newLast30Days: createdLast30d,
      },
    });
  } catch (e) {
    console.error(e);
    return sendJson(res, 500, { error: e.message || 'Erreur serveur' });
  }
}

/** GET /api/admin/users/:userId */
export async function getUserDetail(req, res) {
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
    const userId = String(req.params?.userId || '').trim();
    if (!userId) return sendJson(res, 400, { error: 'userId manquant' });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        createdAt: true,
        _count: { select: { enrollments: true, lessonProgress: true } },
      },
    });
    if (!user) return sendJson(res, 404, { error: 'Utilisateur introuvable' });

    const emailKey = normalizeEmail(user.email);
    const [enrollments, progressRows, webinarRegs, crm] = await Promise.all([
      prisma.enrollment.findMany({
        where: { userId },
        orderBy: { enrolledAt: 'desc' },
        select: { id: true, courseSlug: true, enrolledAt: true },
      }),
      prisma.lessonProgress.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        select: { lessonId: true, completed: true, updatedAt: true, lastPositionSec: true },
      }),
      prisma.webinarRegistration.findMany({
        where: { emailKey },
        include: { webinar: { select: { id: true, title: true, startsAt: true, kind: true } } },
        orderBy: { registeredAt: 'desc' },
      }),
      prisma.marketingContact.findUnique({
        where: { emailKey },
        select: {
          id: true,
          emailKey: true,
          displayName: true,
          phone: true,
          marketingOptIn: true,
          updatedAt: true,
        },
      }),
    ]);

    const completedCount = progressRows.reduce((n, p) => n + (p.completed ? 1 : 0), 0);
    return sendJson(res, 200, {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        createdAt: user.createdAt.toISOString(),
        enrollments: user._count.enrollments,
        progressRows: user._count.lessonProgress,
      },
      enrollments: enrollments.map((e) => ({
        id: e.id,
        courseSlug: e.courseSlug,
        enrolledAt: e.enrolledAt.toISOString(),
      })),
      progress: {
        total: progressRows.length,
        completed: completedCount,
        completionRate: progressRows.length ? Math.round((completedCount / progressRows.length) * 100) : 0,
        rows: progressRows.map((p) => ({
          lessonId: p.lessonId,
          completed: p.completed,
          lastPositionSec: p.lastPositionSec,
          updatedAt: p.updatedAt.toISOString(),
        })),
      },
      webinars: webinarRegs.map((r) => ({
        id: r.id,
        webinarId: r.webinarId,
        webinarTitle: r.webinar?.title || null,
        webinarKind: r.webinar?.kind || null,
        webinarStartsAt: r.webinar?.startsAt ? r.webinar.startsAt.toISOString() : null,
        source: r.userId ? 'account' : 'guest',
        marketingOptIn: r.marketingOptIn,
        guestName: r.guestName || null,
        guestPhone: r.guestPhone || null,
        registeredAt: r.registeredAt.toISOString(),
      })),
      crm: crm
        ? {
            id: crm.id,
            email: crm.emailKey,
            displayName: crm.displayName || null,
            phone: crm.phone || null,
            marketingOptIn: crm.marketingOptIn,
            updatedAt: crm.updatedAt.toISOString(),
          }
        : null,
    });
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
