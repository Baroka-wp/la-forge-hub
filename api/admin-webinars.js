import { prisma } from './_lib/prisma.js';
import { requireAdmin } from './_lib/auth.js';
import { readJsonBody, sendJson, setCors } from './_lib/http.js';
import {
  notifyAdminWebinarCreated,
  broadcastNewWebinarToOptIns,
  broadcastReplayAvailableToOptIns,
} from './_lib/marketingContacts.js';

function isHttpUrl(s) {
  if (!s || typeof s !== 'string') return false;
  try {
    const u = new URL(s.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function validatePayload(body, partial = false) {
  const kind = body.kind;
  if (!partial && (kind !== 'ARCHIVE' && kind !== 'EVENT')) {
    return { error: 'kind doit être ARCHIVE ou EVENT' };
  }
  const k = partial ? undefined : kind;

  const title = body.title != null ? String(body.title).trim() : '';
  const description = body.description != null ? String(body.description).trim() : '';
  const tag = body.tag != null ? String(body.tag).trim() : '';

  if (!partial) {
    if (!title) return { error: 'title requis' };
    if (!description) return { error: 'description requise' };
    if (!tag) return { error: 'tag requis' };
  }

  if (k === 'ARCHIVE') {
    const url = body.recordingUrl != null ? String(body.recordingUrl).trim() : '';
    if (!partial && !isHttpUrl(url)) return { error: 'recordingUrl (URL https) requis pour un replay' };
  }

  if (k === 'EVENT' || (!k && (body.startsAt !== undefined || body.locationType !== undefined))) {
    const startsAt = body.startsAt ? new Date(body.startsAt) : null;
    if (!partial && (!startsAt || Number.isNaN(startsAt.getTime()))) {
      return { error: 'startsAt (date ISO) requis pour un événement' };
    }
    const loc = body.locationType;
    if (!partial && loc !== 'ONLINE' && loc !== 'ONSITE') {
      return { error: 'locationType doit être ONLINE ou ONSITE' };
    }
    if (!partial && loc === 'ONLINE') {
      const link = body.onlineLink != null ? String(body.onlineLink).trim() : '';
      if (!isHttpUrl(link)) return { error: 'onlineLink (URL https) requis pour un webinaire en ligne' };
    }
  }

  return null;
}

function hasReplayUrl(w) {
  return !!(w.recordingUrl && String(w.recordingUrl).trim());
}

function webinarLifecycle(w, now = new Date()) {
  const replayReady = hasReplayUrl(w) || w.kind === 'ARCHIVE';
  if (replayReady) return 'REPLAY_READY';
  if (w.kind === 'EVENT' && w.startsAt && new Date(w.startsAt) > now) return 'UPCOMING';
  if (w.kind === 'EVENT' && w.startsAt && new Date(w.startsAt) <= now) return 'PAST_NEEDS_REPLAY';
  return 'DRAFT';
}

function serializeAdminWebinar(w) {
  const lifecycle = webinarLifecycle(w);
  return {
    id: w.id,
    kind: w.kind,
    title: w.title,
    description: w.description,
    tag: w.tag,
    recordingUrl: w.recordingUrl,
    startsAt: w.startsAt ? w.startsAt.toISOString() : null,
    locationType: w.locationType,
    onlineLink: w.onlineLink,
    venue: w.venue,
    bannerUrl: w.bannerUrl,
    published: w.published,
    createdAt: w.createdAt.toISOString(),
    updatedAt: w.updatedAt ? w.updatedAt.toISOString() : null,
    lifecycle,
  };
}

function parseAdminListQuery(req) {
  const raw = String(req.originalUrl || req.url || '');
  const qStr = raw.includes('?') ? raw.split('?').slice(1).join('?') : '';
  const params = new URLSearchParams(qStr);
  let page = Math.max(1, parseInt(String(params.get('page') || '1'), 10) || 1);
  let pageSize = Math.min(50, Math.max(1, parseInt(String(params.get('pageSize') || '15'), 10) || 15));
  if (pageSize < 5) pageSize = 5;
  const lifecycle = String(params.get('lifecycle') || '').trim();
  const allowed = ['', 'UPCOMING', 'PAST_NEEDS_REPLAY', 'REPLAY_READY'];
  const lifecycleOk = allowed.includes(lifecycle) ? lifecycle : '';
  const q = String(params.get('q') || '').trim().slice(0, 200);
  return { page, pageSize, lifecycle: lifecycleOk, q };
}

/** Filtre Prisma aligné sur webinarLifecycle (serializeAdminWebinar). */
function prismaWhereLifecycle(lifecycle, now) {
  if (!lifecycle) return {};
  const emptyRec = { OR: [{ recordingUrl: null }, { recordingUrl: '' }] };
  if (lifecycle === 'UPCOMING') {
    return { kind: 'EVENT', startsAt: { gt: now }, ...emptyRec };
  }
  if (lifecycle === 'PAST_NEEDS_REPLAY') {
    return { kind: 'EVENT', startsAt: { lte: now }, ...emptyRec };
  }
  if (lifecycle === 'REPLAY_READY') {
    return {
      OR: [
        { kind: 'ARCHIVE' },
        {
          AND: [{ recordingUrl: { not: null } }, { NOT: { recordingUrl: '' } }],
        },
      ],
    };
  }
  return {};
}

function prismaWhereSearch(q) {
  if (!q) return {};
  return {
    OR: [
      { title: { contains: q, mode: 'insensitive' } },
      { tag: { contains: q, mode: 'insensitive' } },
    ],
  };
}

/** GET /api/admin/webinars?page=&pageSize=&lifecycle=&q= */
export async function adminListWebinars(req, res) {
  setCors(res);
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

    const { page, pageSize, lifecycle, q } = parseAdminListQuery(req);
    const now = new Date();

    const wl = prismaWhereLifecycle(lifecycle, now);
    const ws = prismaWhereSearch(q);
    const where =
      Object.keys(wl).length && Object.keys(ws).length
        ? { AND: [wl, ws] }
        : Object.keys(wl).length
          ? wl
          : Object.keys(ws).length
            ? ws
            : {};

    const emptyRec = { OR: [{ recordingUrl: null }, { recordingUrl: '' }] };
    const replayMissingWhere = { kind: 'EVENT', startsAt: { lte: now }, ...emptyRec };

    const [total, replayMissingCount, firstReplayMissing] = await Promise.all([
      prisma.webinar.count({ where }),
      prisma.webinar.count({ where: replayMissingWhere }),
      prisma.webinar.findFirst({
        where: replayMissingWhere,
        orderBy: { startsAt: 'asc' },
        select: { id: true },
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
    const effectivePage = total === 0 ? 1 : Math.min(page, totalPages);

    const rows = await prisma.webinar.findMany({
      where,
      include: { _count: { select: { registrations: true } } },
      orderBy: [{ kind: 'asc' }, { startsAt: 'desc' }, { createdAt: 'desc' }],
      skip: (effectivePage - 1) * pageSize,
      take: pageSize,
    });

    const webinars = rows.map((w) => ({
      ...serializeAdminWebinar(w),
      registrationCount: w._count.registrations,
    }));

    return sendJson(res, 200, {
      webinars,
      total,
      page: effectivePage,
      pageSize,
      totalPages,
      replayMissingCount,
      firstReplayMissingId: firstReplayMissing?.id ?? null,
    });
  } catch (e) {
    console.error(e);
    return sendJson(res, 500, { error: e.message || 'Erreur serveur' });
  }
}

/** GET /api/admin/webinars/:id — détail (édition admin) */
export async function adminGetWebinar(req, res) {
  setCors(res);
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
    const id = req.params?.id;
    if (!id) return sendJson(res, 400, { error: 'id manquant' });

    const row = await prisma.webinar.findUnique({ where: { id } });
    if (!row) return sendJson(res, 404, { error: 'Webinaire introuvable' });

    const webinar = serializeAdminWebinar(row);

    return sendJson(res, 200, { webinar });
  } catch (e) {
    console.error(e);
    return sendJson(res, 500, { error: e.message || 'Erreur serveur' });
  }
}

/** POST /api/admin/webinars */
export async function adminCreateWebinar(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Méthode non autorisée' });
  }
  try {
    const auth = await requireAdmin(req);
    if (auth.error) return sendJson(res, auth.status, { error: auth.error });
    const body = await readJsonBody(req);

    /** Création : toujours une session (EVENT). Le replay s’ajoute ensuite en modification. */
    const bodyEvent = { ...body, kind: 'EVENT' };
    const err = validatePayload(bodyEvent, false);
    if (err) return sendJson(res, 400, err);

    const data = {
      kind: 'EVENT',
      title: String(body.title).trim(),
      description: String(body.description).trim(),
      tag: String(body.tag).trim(),
      published: body.published !== false,
      recordingUrl: null,
      startsAt: new Date(body.startsAt),
      locationType: body.locationType,
      onlineLink: body.onlineLink != null ? String(body.onlineLink).trim() || null : null,
      venue: body.venue != null ? String(body.venue).trim() || null : null,
      bannerUrl: null,
    };
    const b = body.bannerUrl != null ? String(body.bannerUrl).trim() : '';
    data.bannerUrl = isHttpUrl(b) ? b : null;
    if (data.locationType === 'ONLINE' && !isHttpUrl(data.onlineLink || '')) {
      return sendJson(res, 400, { error: 'onlineLink (URL https) requis pour un webinaire en ligne' });
    }

    const row = await prisma.webinar.create({ data });
    void notifyAdminWebinarCreated(row).catch((err) => console.error('[brevo] notify admin', err));
    void broadcastNewWebinarToOptIns(row).catch((err) => console.error('[brevo] broadcast new webinar', err));
    return sendJson(res, 201, { webinar: row });
  } catch (e) {
    console.error(e);
    return sendJson(res, 500, { error: e.message || 'Erreur serveur' });
  }
}

/** PATCH /api/admin/webinars/:id */
export async function adminPatchWebinar(req, res) {
  setCors(res);
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
    const id = req.params?.id;
    if (!id) return sendJson(res, 400, { error: 'id manquant' });
    const body = await readJsonBody(req);

    const existing = await prisma.webinar.findUnique({ where: { id } });
    if (!existing) return sendJson(res, 404, { error: 'Webinaire introuvable' });

    const hadRecording = !!(existing.recordingUrl && String(existing.recordingUrl).trim());

    const merged = {
      kind: body.kind !== undefined ? body.kind : existing.kind,
      title: body.title !== undefined ? body.title : existing.title,
      description: body.description !== undefined ? body.description : existing.description,
      tag: body.tag !== undefined ? body.tag : existing.tag,
      recordingUrl: body.recordingUrl !== undefined ? body.recordingUrl : existing.recordingUrl,
      startsAt: body.startsAt !== undefined ? body.startsAt : existing.startsAt,
      locationType: body.locationType !== undefined ? body.locationType : existing.locationType,
      onlineLink: body.onlineLink !== undefined ? body.onlineLink : existing.onlineLink,
      venue: body.venue !== undefined ? body.venue : existing.venue,
      bannerUrl: body.bannerUrl !== undefined ? body.bannerUrl : existing.bannerUrl,
      published: body.published !== undefined ? body.published : existing.published,
    };

    const err = validatePayload(merged, false);
    if (err) return sendJson(res, 400, err);

    const data = {};
    if (body.title !== undefined) data.title = String(body.title).trim();
    if (body.description !== undefined) data.description = String(body.description).trim();
    if (body.tag !== undefined) data.tag = String(body.tag).trim();
    if (body.published !== undefined) data.published = !!body.published;
    if (body.kind === 'ARCHIVE' || body.kind === 'EVENT') data.kind = body.kind;
    if (body.recordingUrl !== undefined) {
      const v = body.recordingUrl != null ? String(body.recordingUrl).trim() : '';
      data.recordingUrl = v || null;
    }
    if (body.startsAt !== undefined) {
      data.startsAt = body.startsAt ? new Date(body.startsAt) : null;
    }
    if (body.locationType !== undefined) data.locationType = body.locationType || null;
    if (body.onlineLink !== undefined) {
      const v = body.onlineLink != null ? String(body.onlineLink).trim() : '';
      data.onlineLink = v || null;
    }
    if (body.venue !== undefined) {
      const v = body.venue != null ? String(body.venue).trim() : '';
      data.venue = v || null;
    }
    if (body.bannerUrl !== undefined) {
      const v = body.bannerUrl != null ? String(body.bannerUrl).trim() : '';
      data.bannerUrl = isHttpUrl(v) ? v : null;
    }

    if (Object.keys(data).length === 0) {
      return sendJson(res, 400, { error: 'Aucun champ à mettre à jour' });
    }

    const row = await prisma.webinar.update({ where: { id }, data });
    const nowHasRecording = !!(row.recordingUrl && String(row.recordingUrl).trim());
    if (!hadRecording && nowHasRecording) {
      void broadcastReplayAvailableToOptIns(row).catch((err) => console.error('[brevo] replay broadcast', err));
    }
    return sendJson(res, 200, { webinar: row });
  } catch (e) {
    if (e.code === 'P2025') {
      return sendJson(res, 404, { error: 'Webinaire introuvable' });
    }
    console.error(e);
    return sendJson(res, 500, { error: e.message || 'Erreur serveur' });
  }
}

/** DELETE /api/admin/webinars/:id */
export async function adminDeleteWebinar(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'DELETE') {
    return sendJson(res, 405, { error: 'Méthode non autorisée' });
  }
  try {
    const auth = await requireAdmin(req);
    if (auth.error) return sendJson(res, auth.status, { error: auth.error });
    const id = req.params?.id;
    if (!id) return sendJson(res, 400, { error: 'id manquant' });

    await prisma.webinar.delete({ where: { id } });
    return sendJson(res, 200, { ok: true });
  } catch (e) {
    if (e.code === 'P2025') {
      return sendJson(res, 404, { error: 'Webinaire introuvable' });
    }
    console.error(e);
    return sendJson(res, 500, { error: e.message || 'Erreur serveur' });
  }
}

/** GET /api/admin/webinars/:id/registrations */
export async function adminWebinarRegistrations(req, res) {
  setCors(res);
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
    const id = req.params?.id;
    if (!id) return sendJson(res, 400, { error: 'id manquant' });

    const webinar = await prisma.webinar.findUnique({ where: { id } });
    if (!webinar) return sendJson(res, 404, { error: 'Webinaire introuvable' });

    const regs = await prisma.webinarRegistration.findMany({
      where: { webinarId: id },
      include: {
        user: { select: { id: true, email: true, displayName: true } },
      },
      orderBy: { registeredAt: 'asc' },
    });

    const registrations = regs.map((r) => ({
      id: r.id,
      registeredAt: r.registeredAt.toISOString(),
      source: r.userId ? 'account' : 'guest',
      user: r.user,
      email: r.user?.email ?? r.emailKey,
      displayName: r.user?.displayName ?? r.guestName ?? null,
      guestPhone: r.guestPhone,
      marketingOptIn: r.marketingOptIn,
    }));

    return sendJson(res, 200, {
      webinar: {
        id: webinar.id,
        title: webinar.title,
        kind: webinar.kind,
        startsAt: webinar.startsAt ? webinar.startsAt.toISOString() : null,
      },
      registrations,
    });
  } catch (e) {
    console.error(e);
    return sendJson(res, 500, { error: e.message || 'Erreur serveur' });
  }
}
