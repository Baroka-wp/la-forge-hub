import { prisma } from './_lib/prisma.js';
import { optionalUser } from './_lib/auth.js';
import { sendJson, setCors } from './_lib/http.js';
import { normalizeEmail } from './_lib/email.js';

/** req.originalUrl peut contenir ?regEmail=… malgré la normalisation de req.url. */
function queryParamsFromReq(req) {
  const u = String(req.originalUrl || req.url || '');
  const qi = u.indexOf('?');
  if (qi === -1) return new URLSearchParams();
  return new URLSearchParams(u.slice(qi + 1));
}

/** Inscription liée au compte ou à l’e-mail (invité puis compte créé avec le même mail). */
function registrationWhereForUser(user) {
  if (!user) return undefined;
  const emailKey = normalizeEmail(user.email);
  return {
    OR: [{ userId: user.id }, { emailKey }],
  };
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

function shouldAppearInKind(lifecycle, kind) {
  if (kind === 'ARCHIVE') return lifecycle === 'REPLAY_READY';
  if (kind === 'EVENT') return lifecycle === 'UPCOMING';
  return lifecycle === 'UPCOMING' || lifecycle === 'REPLAY_READY';
}

function serialize(w, extras = {}) {
  const lifecycle = webinarLifecycle(w);
  const registered = extras.registered === true;
  const now = new Date();
  const upcomingOnlineJoin =
    w.kind === 'EVENT' &&
    w.locationType === 'ONLINE' &&
    w.startsAt &&
    new Date(w.startsAt) > now &&
    !hasReplayUrl(w);
  const hideJoinLink = upcomingOnlineJoin && !registered;

  return {
    id: w.id,
    kind: w.kind,
    title: w.title,
    description: w.description,
    tag: w.tag,
    recordingUrl: w.recordingUrl,
    startsAt: w.startsAt ? w.startsAt.toISOString() : null,
    locationType: w.locationType,
    onlineLink: hideJoinLink ? null : w.onlineLink,
    venue: w.venue,
    bannerUrl: w.bannerUrl,
    registrationCount: w._count?.registrations ?? undefined,
    registered: extras.registered,
    lifecycle,
  };
}

/** GET /api/webinars?kind=ARCHIVE|EVENT */
export async function listWebinars(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: 'Méthode non autorisée' });
  }
  try {
    const q = (req.url || '').split('?')[1] || '';
    const params = new URLSearchParams(q);
    const kind = params.get('kind');
    const now = new Date();

    const { user } = await optionalUser(req);
    const userId = user?.id;
    const regWhere = registrationWhereForUser(user);

    const rows = await prisma.webinar.findMany({
      where: { published: true },
      include: {
        _count: { select: { registrations: true } },
        ...(regWhere
          ? {
              registrations: {
                where: regWhere,
                select: { id: true },
                take: 1,
              },
            }
          : {}),
      },
      orderBy: [{ kind: 'asc' }, { startsAt: 'asc' }, { createdAt: 'desc' }],
    });

    const visible = rows.filter((w) => shouldAppearInKind(webinarLifecycle(w, now), kind));
    const replays = visible.filter((w) => webinarLifecycle(w, now) === 'REPLAY_READY');
    const upcoming = visible.filter((w) => webinarLifecycle(w, now) === 'UPCOMING');

    replays.sort((a, b) => {
      const da = a.startsAt ? new Date(a.startsAt).getTime() : new Date(a.createdAt).getTime();
      const db = b.startsAt ? new Date(b.startsAt).getTime() : new Date(b.createdAt).getTime();
      return db - da;
    });
    upcoming.sort((a, b) => {
      const ta = a.startsAt ? new Date(a.startsAt).getTime() : 0;
      const tb = b.startsAt ? new Date(b.startsAt).getTime() : 0;
      return ta - tb;
    });
    const ordered = [...upcoming, ...replays];

    const webinars = ordered.map((w) => {
      const registered = w.kind === 'EVENT' && userId ? (w.registrations?.length ?? 0) > 0 : false;
      const { registrations: _r, ...rest } = w;
      return serialize(rest, { registered });
    });

    return sendJson(res, 200, { webinars });
  } catch (e) {
    console.error(e);
    return sendJson(res, 500, { error: e.message || 'Erreur serveur' });
  }
}

/** GET /api/webinars/next — prochain webinaire à venir (EVENT, date future) */
export async function getNextWebinar(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: 'Méthode non autorisée' });
  }
  try {
    const now = new Date();
    const { user } = await optionalUser(req);
    const userId = user?.id;
    const regWhere = registrationWhereForUser(user);

    const rows = await prisma.webinar.findMany({
      where: {
        published: true,
        kind: 'EVENT',
      },
      orderBy: [{ startsAt: 'asc' }, { createdAt: 'desc' }],
      include: {
        _count: { select: { registrations: true } },
        ...(regWhere
          ? {
              registrations: {
                where: regWhere,
                select: { id: true },
                take: 1,
              },
            }
          : {}),
      },
    });

    const next = rows.find((x) => webinarLifecycle(x, now) === 'UPCOMING') || null;

    if (!next) {
      return sendJson(res, 200, { webinar: null });
    }

    const registered = userId ? (next.registrations?.length ?? 0) > 0 : false;
    const { registrations: _r, ...rest } = next;
    return sendJson(res, 200, { webinar: serialize(rest, { registered }) });
  } catch (e) {
    console.error(e);
    return sendJson(res, 500, { error: e.message || 'Erreur serveur' });
  }
}

/** GET /api/webinars/:id */
export async function getWebinarById(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: 'Méthode non autorisée' });
  }
  try {
    const id = req.params?.id;
    if (!id) return sendJson(res, 400, { error: 'id manquant' });

    const { user } = await optionalUser(req);
    const userId = user?.id;
    const regWhere = registrationWhereForUser(user);

    const regEmail = normalizeEmail(queryParamsFromReq(req).get('regEmail') || '');

    const w = await prisma.webinar.findFirst({
      where: { id, published: true },
      include: {
        _count: { select: { registrations: true } },
        ...(regWhere
          ? {
              registrations: {
                where: regWhere,
                select: { id: true },
                take: 1,
              },
            }
          : {}),
      },
    });

    if (!w) {
      return sendJson(res, 404, { error: 'Webinaire introuvable' });
    }

    let guestRegistered = false;
    if (!userId && regEmail && w.kind === 'EVENT') {
      const hit = await prisma.webinarRegistration.findFirst({
        where: { webinarId: id, emailKey: regEmail },
        select: { id: true },
      });
      guestRegistered = !!hit;
    }

    let registered = false;
    if (w.kind === 'EVENT') {
      if (userId) {
        registered = (w.registrations?.length ?? 0) > 0;
      } else if (regEmail) {
        registered = guestRegistered;
      } else {
        registered = false;
      }
    }

    const { registrations: _r, ...rest } = w;
    return sendJson(res, 200, { webinar: serialize(rest, { registered }) });
  } catch (e) {
    console.error(e);
    return sendJson(res, 500, { error: e.message || 'Erreur serveur' });
  }
}
