import { prisma } from './_lib/prisma.js';
import { requireAdmin } from './_lib/auth.js';
import { sendJson, setCors } from './_lib/http.js';

function parseQuery(req) {
  const raw = String(req.originalUrl || req.url || '');
  const params = new URLSearchParams(raw.includes('?') ? raw.split('?').slice(1).join('?') : '');
  const q = String(params.get('q') || '').trim().slice(0, 160);
  const kind = ['NOAI', 'BOOTCAMP'].includes(params.get('kind')) ? params.get('kind') : '';
  const allowedStatuses = ['requested', 'downloaded', 'not_requested', 'missing_files'];
  const status = allowedStatuses.includes(params.get('status')) ? params.get('status') : '';
  const page = Math.max(1, Number.parseInt(params.get('page') || '1', 10) || 1);
  const pageSize = Math.min(200, Math.max(10, Number.parseInt(params.get('pageSize') || '25', 10) || 25));
  return { q, kind, status, page, pageSize };
}

function participantWhere({ q, kind, status }) {
  return {
    ...(q
      ? {
          OR: [
            { tableNumber: { contains: q, mode: 'insensitive' } },
            { lastName: { contains: q, mode: 'insensitive' } },
            { firstName: { contains: q, mode: 'insensitive' } },
            { email: { contains: q, mode: 'insensitive' } },
            { phone: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {}),
    ...(kind ? { certificates: { some: { kind } } } : {}),
    ...(status === 'requested' ? { requestCount: { gt: 0 } } : {}),
    ...(status === 'downloaded' ? { certificates: { some: { downloadCount: { gt: 0 }, ...(kind ? { kind } : {}) } } } : {}),
    ...(status === 'not_requested' ? { requestCount: 0 } : {}),
    ...(status === 'missing_files' ? { certificates: { some: { pdf: null, ...(kind ? { kind } : {}) } } } : {}),
  };
}

/** GET /api/admin/attestations — métadonnées uniquement, jamais les PDF. */
export default async function adminAttestations(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Méthode non autorisée' });

  try {
    const auth = await requireAdmin(req);
    if (auth.error) return sendJson(res, auth.status, { error: auth.error });

    const query = parseQuery(req);
    const where = participantWhere(query);
    const [total, participantCount, certificateCount, readyCount, requestedCount, downloadedParticipants, downloadStats, requestCount, failedRequests] =
      await Promise.all([
        prisma.participant.count({ where }),
        prisma.participant.count(),
        prisma.certificate.count(),
        prisma.certificate.count({ where: { pdf: { not: null } } }),
        prisma.participant.count({ where: { requestCount: { gt: 0 } } }),
        prisma.participant.count({ where: { certificates: { some: { downloadCount: { gt: 0 } } } } }),
        prisma.certificate.aggregate({ _sum: { downloadCount: true } }),
        prisma.certificateRequest.count(),
        prisma.certificateRequest.count({ where: { outcome: { not: 'FOUND' } } }),
      ]);

    const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
    const safePage = Math.min(query.page, totalPages);
    const rows = await prisma.participant.findMany({
      where,
      orderBy: { tableNumber: 'asc' },
      skip: (safePage - 1) * query.pageSize,
      take: query.pageSize,
      select: {
        id: true,
        tableNumber: true,
        lastName: true,
        firstName: true,
        declaredName: true,
        email: true,
        phone: true,
        requestCount: true,
        firstRequestAt: true,
        lastRequestAt: true,
        certificates: {
          orderBy: { kind: 'asc' },
          select: { id: true, kind: true, fileName: true, downloadCount: true },
        },
      },
    });

    const participants = rows.map((row) => ({
      ...row,
      firstRequestAt: row.firstRequestAt?.toISOString() || null,
      lastRequestAt: row.lastRequestAt?.toISOString() || null,
      certificates: row.certificates.map((certificate) => ({ ...certificate, ready: Boolean(certificate.fileName) })),
    }));

    return sendJson(res, 200, {
      participants,
      total,
      page: total ? safePage : 1,
      pageSize: query.pageSize,
      totalPages,
      totals: {
        participants: participantCount,
        certificates: certificateCount,
        ready: readyCount,
        requested: requestedCount,
        downloadedParticipants,
        downloads: downloadStats._sum.downloadCount || 0,
        requests: requestCount,
        failedRequests,
      },
    });
  } catch (error) {
    console.error('[admin-attestations]', error);
    return sendJson(res, 500, { error: error.message || 'Erreur serveur' });
  }
}
