import { COURSE, parseSessions, RAW_SESSIONS } from './seed-data.js';
import { pushLoading, popLoading } from './loader.js';

const JWT_KEY = 'lms_jwt';

function apiBase() {
  return import.meta.env.VITE_API_BASE_URL || '';
}

function neonMode() {
  const v = import.meta.env.VITE_USE_NEON_API;
  if (v === true) return true;
  const s = String(v ?? '').trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes';
}

function apiUrl(path) {
  return `${apiBase()}${path}`;
}

async function apiFetch(path, opts = {}) {
  const { silentLoader = false, ...fetchOpts } = opts;
  const token = localStorage.getItem(JWT_KEY);
  const headers = { ...(fetchOpts.headers || {}) };
  if (!(fetchOpts.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) headers.Authorization = `Bearer ${token}`;
  const showLoader = neonMode() && !silentLoader;
  if (showLoader) pushLoading();
  try {
    return await fetch(apiUrl(path), { ...fetchOpts, headers });
  } finally {
    if (showLoader) popLoading();
  }
}

/* ---------- local (sans API) ---------- */

function localUserKey() {
  return 'lms_local_user_v1';
}

function localAccountsKey() {
  return 'lms_accounts_v1';
}

function readAccounts() {
  try {
    return JSON.parse(localStorage.getItem(localAccountsKey()) || '[]');
  } catch {
    return [];
  }
}

function writeAccounts(arr) {
  localStorage.setItem(localAccountsKey(), JSON.stringify(arr));
}

function localProgressKey(uid) {
  return `lms_progress_${uid}`;
}

function localEnrollKey(uid) {
  return `lms_enroll_${uid}`;
}

function localPostsKey() {
  return 'lms_posts_v1';
}

function readLocalUser() {
  try {
    const j = localStorage.getItem(localUserKey());
    return j ? JSON.parse(j) : null;
  } catch {
    return null;
  }
}

function writeLocalUser(u) {
  if (u) localStorage.setItem(localUserKey(), JSON.stringify(u));
  else localStorage.removeItem(localUserKey());
}

function readProgressMap(uid) {
  try {
    const j = localStorage.getItem(localProgressKey(uid));
    return j ? JSON.parse(j) : {};
  } catch {
    return {};
  }
}

function writeProgressMap(uid, map) {
  localStorage.setItem(localProgressKey(uid), JSON.stringify(map));
}

function readEnrolled(uid) {
  try {
    const j = localStorage.getItem(localEnrollKey(uid));
    return j ? JSON.parse(j) : {};
  } catch {
    return {};
  }
}

function writeEnrolled(uid, map) {
  localStorage.setItem(localEnrollKey(uid), JSON.stringify(map));
}

function readAllPosts() {
  try {
    const j = localStorage.getItem(localPostsKey());
    return j ? JSON.parse(j) : [];
  } catch {
    return [];
  }
}

function writeAllPosts(arr) {
  localStorage.setItem(localPostsKey(), JSON.stringify(arr));
}

export function backendMode() {
  if (neonMode()) return 'neon';
  return 'local';
}

/** @returns {Promise<{ user: object|null, error?: string }>} */
export async function getSession() {
  if (neonMode()) {
    const token = localStorage.getItem(JWT_KEY);
    if (!token) return { user: null };
    const r = await apiFetch('/api/me', { method: 'GET' });
    if (r.status === 401) {
      localStorage.removeItem(JWT_KEY);
      return { user: null };
    }
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      return { user: null, error: err.error || r.statusText };
    }
    const data = await r.json();
    return {
      user: data.user
        ? {
            id: data.user.id,
            email: data.user.email,
            displayName: data.user.displayName,
            role: data.user.role,
            isAdmin: !!data.isAdmin,
          }
        : null,
    };
  }
  const lu = readLocalUser();
  if (!lu) return { user: null };
  return {
    user: {
      id: lu.id,
      email: lu.email,
      displayName: lu.displayName,
      isAdmin: false,
    },
  };
}

export async function signUp(email, password, displayName) {
  if (neonMode()) {
    const r = await apiFetch('/api/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, displayName }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: data.error || 'Erreur inscription' };
    if (data.token) localStorage.setItem(JWT_KEY, data.token);
    return { ok: true, user: data.user };
  }
  const accounts = readAccounts();
  if (accounts.some((a) => a.email.toLowerCase() === email.toLowerCase())) {
    return { ok: false, error: 'Cette adresse e-mail est déjà utilisée.' };
  }
  if (password.length < 6) return { ok: false, error: 'Le mot de passe doit contenir au moins 6 caractères.' };
  const id = crypto.randomUUID();
  const dn = (displayName || '').trim() || email.split('@')[0];
  accounts.push({ id, email, password, displayName: dn });
  writeAccounts(accounts);
  writeLocalUser({ id, email, displayName: dn });
  return { ok: true, user: { id, email } };
}

export async function signIn(email, password) {
  if (neonMode()) {
    const r = await apiFetch('/api/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: data.error || 'Erreur connexion' };
    if (data.token) localStorage.setItem(JWT_KEY, data.token);
    return { ok: true, user: data.user };
  }
  const accounts = readAccounts();
  const a = accounts.find((x) => x.email.toLowerCase() === email.toLowerCase());
  if (!a || a.password !== password) {
    return { ok: false, error: 'E-mail ou mot de passe incorrect.' };
  }
  writeLocalUser({ id: a.id, email: a.email, displayName: a.displayName });
  return { ok: true, user: { id: a.id, email: a.email } };
}

export async function signOut() {
  if (neonMode()) {
    localStorage.removeItem(JWT_KEY);
    return;
  }
  writeLocalUser(null);
}

async function fetchMeNeon() {
  const r = await apiFetch('/api/me', { method: 'GET' });
  if (!r.ok) return null;
  return r.json();
}

export async function isEnrolled(userId, courseSlug = COURSE.slug) {
  if (!userId) return false;
  if (neonMode()) {
    const me = await fetchMeNeon();
    return !!(me?.enrollments && me.enrollments.includes(courseSlug));
  }
  const m = readEnrolled(userId);
  return !!m[courseSlug];
}

export async function enroll(userId, courseSlug = COURSE.slug, marketingOptIn = false) {
  if (!userId) return { ok: false, error: 'Non connecté' };
  if (neonMode()) {
    const r = await apiFetch('/api/enroll', {
      method: 'POST',
      body: JSON.stringify({ courseSlug, marketingOptIn: !!marketingOptIn }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: data.error || 'Erreur' };
    return { ok: true };
  }
  const m = readEnrolled(userId);
  m[courseSlug] = true;
  writeEnrolled(userId, m);
  return { ok: true };
}

export async function getProgressMap(userId) {
  if (!userId) return {};
  if (neonMode()) {
    const r = await apiFetch('/api/progress', { method: 'GET' });
    if (!r.ok) return {};
    const data = await r.json();
    return data.map || {};
  }
  return readProgressMap(userId);
}

export async function upsertProgress(userId, lessonId, { completed, last_position_sec = 0 }) {
  if (!userId) return { ok: false };
  if (neonMode()) {
    const r = await apiFetch('/api/progress', {
      method: 'POST',
      body: JSON.stringify({
        lesson_id: lessonId,
        completed,
        last_position_sec,
      }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: data.error };
    return { ok: true };
  }
  const map = readProgressMap(userId);
  const prev = map[lessonId] || {};
  map[lessonId] = {
    completed: completed !== undefined ? !!completed : prev.completed,
    last_position_sec: last_position_sec !== undefined ? last_position_sec : prev.last_position_sec || 0,
  };
  writeProgressMap(userId, map);
  return { ok: true };
}

export async function getCommunityPosts(lessonId) {
  if (neonMode()) {
    const r = await apiFetch(`/api/posts?lesson_id=${encodeURIComponent(lessonId)}`, { method: 'GET' });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      return { posts: [], error: err.error || r.statusText };
    }
    const data = await r.json();
    return { posts: data.posts || [] };
  }
  const all = readAllPosts().filter((p) => p.lesson_id === lessonId);
  return { posts: all.sort((a, b) => new Date(a.created_at) - new Date(b.created_at)) };
}

export async function addCommunityPost(userId, lessonId, body, parentId = null) {
  if (!userId || !body?.trim()) return { ok: false, error: 'Message invalide' };
  if (neonMode()) {
    const r = await apiFetch('/api/posts', {
      method: 'POST',
      body: JSON.stringify({ lesson_id: lessonId, body: body.trim(), parent_id: parentId }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: data.error };
    return { ok: true };
  }
  const all = readAllPosts();
  const post = {
    id: crypto.randomUUID(),
    lesson_id: lessonId,
    user_id: userId,
    body: body.trim(),
    parent_id: parentId,
    created_at: new Date().toISOString(),
    display_name: readLocalUser()?.displayName || 'Moi',
  };
  all.push(post);
  writeAllPosts(all);
  return { ok: true };
}

export function onAuthChange(_callback) {
  return () => {};
}

/** Normalise une entrée renvoyée par GET /api/lessons */
function lessonFromApi(row) {
  const d = row.recordedAt ? new Date(row.recordedAt) : new Date();
  const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const day = d.getDate();
  const weekday = d.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '');
  return {
    date: d,
    monthKey,
    day,
    weekday,
    title: row.title,
    description: row.description != null && String(row.description).trim() ? String(row.description).trim() : null,
    url: row.url || `https://youtu.be/${row.youtubeId}`,
    tag: row.tag,
    youtubeId: row.youtubeId,
    lessonId: row.lessonId,
    collabUrl: row.collabUrl || null,
  };
}

/**
 * Catalogue leçons : base Neon si des lignes existent, sinon fichier `seed-data.js`.
 * À appeler au démarrage (et après modification admin).
 */
export async function loadCatalogSessions() {
  const localFallback = () =>
    parseSessions(RAW_SESSIONS).map((s) => ({ ...s, collabUrl: null, description: null }));
  if (!neonMode()) return localFallback();
  try {
    const r = await apiFetch(`/api/lessons?course=${encodeURIComponent(COURSE.slug)}`);
    if (!r.ok) return localFallback();
    const data = await r.json();
    if (!data.lessons?.length) return localFallback();
    return data.lessons.map((row) => lessonFromApi(row));
  } catch {
    return localFallback();
  }
}

/** Met à jour une leçon (admin). Champs optionnels : title, youtubeId, tag, position, collabUrl, recordedAt */
export async function adminPatchLesson(lessonId, fields) {
  if (!neonMode()) return { ok: false, error: 'Réservé au mode API Neon' };
  const r = await apiFetch(`/api/admin/lessons/${encodeURIComponent(lessonId)}`, {
    method: 'PATCH',
    body: JSON.stringify(fields),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, error: data.error || r.statusText };
  return { ok: true, lesson: data.lesson };
}

export async function adminCreateLesson(body) {
  if (!neonMode()) return { ok: false, error: 'Réservé au mode API Neon' };
  const r = await apiFetch('/api/admin/lessons', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, error: data.error || r.statusText };
  return { ok: true, lesson: data.lesson };
}

export async function adminDeleteLesson(lessonId) {
  if (!neonMode()) return { ok: false, error: 'Réservé au mode API Neon' };
  const r = await apiFetch(`/api/admin/lessons/${encodeURIComponent(lessonId)}`, {
    method: 'DELETE',
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, error: data.error || r.statusText };
  return { ok: true };
}

export async function subscribeToReplay(webinarId, payload = {}) {
  if (!neonMode()) return { ok: false, error: 'Mode local' };
  const body = {
    webinarId,
    email: payload.email || '',
    fullName: payload.fullName || '',
  };
  const r = await apiFetch('/api/webinars/replay-optin', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, error: data.error || r.statusText };
  return { ok: true };
}

export async function fetchAdminOverview() {
  if (!neonMode()) return { ok: false, error: 'Mode local' };
  const r = await apiFetch('/api/admin/overview', { method: 'GET' });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, error: data.error || r.statusText };
  return { ok: true, userCount: data.userCount, lessonCount: data.lessonCount, adminCount: data.adminCount };
}

export async function fetchAdminUsersList() {
  if (!neonMode()) return { ok: false, error: 'Mode local', users: [] };
  const r = await apiFetch('/api/admin/users', { method: 'GET' });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, error: data.error || r.statusText, users: [] };
  return { ok: true, users: data.users || [] };
}

export async function adminPatchUser(userId, fields) {
  if (!neonMode()) return { ok: false, error: 'Mode local' };
  const r = await apiFetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    body: JSON.stringify(fields),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, error: data.error || r.statusText };
  return { ok: true, user: data.user };
}

/** Liste brute des leçons (GET /api/lessons) pour l’admin */
export async function fetchLessonsForAdmin() {
  if (!neonMode()) return { ok: false, lessons: [] };
  const r = await apiFetch(`/api/lessons?course=${encodeURIComponent(COURSE.slug)}`);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, error: data.error || r.statusText, lessons: [] };
  return { ok: true, lessons: data.lessons || [] };
}

/** @param {'ARCHIVE'|'EVENT'|undefined} kind */
export async function fetchWebinars(kind) {
  if (!neonMode()) return { ok: false, error: 'Mode local', webinars: [] };
  const q = kind ? `?kind=${encodeURIComponent(kind)}` : '';
  const r = await apiFetch(`/api/webinars${q}`, { method: 'GET' });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, error: data.error || r.statusText, webinars: [] };
  return { ok: true, webinars: data.webinars || [] };
}

/**
 * @param {string} id
 * @param {{ guestEmail?: string }} [opts] — e-mail invité enregistré (session) pour afficher le lien de connexion
 */
export async function fetchWebinarById(id, opts = {}) {
  if (!neonMode()) return { ok: false, error: 'Mode local', webinar: null };
  const ge = String(opts.guestEmail || '').trim();
  const qs = ge ? `?regEmail=${encodeURIComponent(ge)}` : '';
  const r = await apiFetch(`/api/webinars/${encodeURIComponent(id)}${qs}`, { method: 'GET' });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, error: data.error || r.statusText, webinar: null };
  return { ok: true, webinar: data.webinar };
}

export async function fetchNextWebinarEvent() {
  if (!neonMode()) return { ok: false, webinar: null };
  const r = await apiFetch('/api/webinars/next', { method: 'GET' });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, webinar: null };
  return { ok: true, webinar: data.webinar || null };
}

/**
 * Inscription webinaire : compte connecté (JWT) ou invité avec { email, phone, fullName }.
 * @param {string} webinarId
 * @param {{ email?: string, phone?: string, fullName?: string }} [guest]
 */
export async function registerForWebinar(webinarId, guest) {
  if (!neonMode()) return { ok: false, error: 'Mode local' };
  const payload =
    guest && typeof guest === 'object'
      ? {
          ...(guest.email ? { email: guest.email } : {}),
          ...(guest.phone ? { phone: guest.phone } : {}),
          ...(guest.fullName ? { fullName: guest.fullName } : {}),
          marketingOptIn: guest.marketingOptIn === true,
        }
      : {};
  const r = await apiFetch(`/api/webinars/${encodeURIComponent(webinarId)}/register`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, error: data.error || r.statusText };
  return { ok: true };
}

/**
 * @param {{ page?: number, pageSize?: number, lifecycle?: string, q?: string }} [params]
 */
export async function fetchAdminWebinars(params = {}) {
  if (!neonMode()) {
    return {
      ok: false,
      webinars: [],
      total: 0,
      page: 1,
      pageSize: 15,
      totalPages: 0,
      replayMissingCount: 0,
      firstReplayMissingId: null,
    };
  }
  const sp = new URLSearchParams();
  if (params.page != null) sp.set('page', String(params.page));
  if (params.pageSize != null) sp.set('pageSize', String(params.pageSize));
  if (params.lifecycle) sp.set('lifecycle', String(params.lifecycle));
  if (params.q) sp.set('q', String(params.q));
  const qs = sp.toString();
  const r = await apiFetch(`/api/admin/webinars${qs ? `?${qs}` : ''}`, { method: 'GET' });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    return {
      ok: false,
      error: data.error || r.statusText,
      webinars: [],
      total: 0,
      page: 1,
      pageSize: 15,
      totalPages: 0,
      replayMissingCount: 0,
      firstReplayMissingId: null,
    };
  }
  return {
    ok: true,
    webinars: data.webinars || [],
    total: data.total ?? data.webinars?.length ?? 0,
    page: data.page ?? 1,
    pageSize: data.pageSize ?? 15,
    totalPages: data.totalPages ?? 1,
    replayMissingCount: data.replayMissingCount ?? 0,
    firstReplayMissingId: data.firstReplayMissingId ?? null,
  };
}

export async function fetchAdminWebinar(webinarId) {
  if (!neonMode()) return { ok: false, error: 'Mode local', webinar: null };
  const r = await apiFetch(`/api/admin/webinars/${encodeURIComponent(webinarId)}`, { method: 'GET' });
  const ct = r.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    return {
      ok: false,
      error:
        'Réponse serveur invalide (page HTML au lieu de l’API). Redémarrez le serveur de dev (`npm run dev`) ou rechargez la page.',
      webinar: null,
    };
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, error: data.error || r.statusText, webinar: null };
  if (!data.webinar) return { ok: false, error: data.error || 'Webinaire introuvable', webinar: null };
  return { ok: true, webinar: data.webinar };
}

export async function adminCreateWebinar(body) {
  if (!neonMode()) return { ok: false, error: 'Mode local' };
  const r = await apiFetch('/api/admin/webinars', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, error: data.error || r.statusText };
  return { ok: true, webinar: data.webinar };
}

export async function adminPatchWebinar(webinarId, fields) {
  if (!neonMode()) return { ok: false, error: 'Mode local' };
  const r = await apiFetch(`/api/admin/webinars/${encodeURIComponent(webinarId)}`, {
    method: 'PATCH',
    body: JSON.stringify(fields),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, error: data.error || r.statusText };
  return { ok: true, webinar: data.webinar };
}

export async function adminDeleteWebinar(webinarId) {
  if (!neonMode()) return { ok: false, error: 'Mode local' };
  const r = await apiFetch(`/api/admin/webinars/${encodeURIComponent(webinarId)}`, {
    method: 'DELETE',
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, error: data.error || r.statusText };
  return { ok: true };
}

export async function fetchAdminWebinarRegistrations(webinarId) {
  if (!neonMode()) return { ok: false, registrations: [] };
  const r = await apiFetch(`/api/admin/webinars/${encodeURIComponent(webinarId)}/registrations`, {
    method: 'GET' });
  const ct = r.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    return { ok: false, error: 'Réponse serveur invalide (attendu JSON).', registrations: [] };
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, error: data.error || r.statusText, registrations: [] };
  return {
    ok: true,
    webinar: data.webinar,
    registrations: data.registrations || [],
  };
}

/**
 * @param {{ page?: number, pageSize?: number, q?: string }} [params]
 */
export async function fetchAdminCrmContacts(params = {}) {
  if (!neonMode()) {
    return { ok: false, contacts: [], total: 0, page: 1, pageSize: 25, totalPages: 0 };
  }
  const sp = new URLSearchParams();
  if (params.page != null) sp.set('page', String(params.page));
  if (params.pageSize != null) sp.set('pageSize', String(params.pageSize));
  if (params.q) sp.set('q', String(params.q));
  const qs = sp.toString();
  const r = await apiFetch(`/api/admin/crm/contacts${qs ? `?${qs}` : ''}`, {
    method: 'GET',
    silentLoader: true,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    return {
      ok: false,
      error: data.error || r.statusText,
      contacts: [],
      total: 0,
      page: 1,
      pageSize: 25,
      totalPages: 0,
    };
  }
  return {
    ok: true,
    contacts: data.contacts || [],
    total: data.total ?? 0,
    page: data.page ?? 1,
    pageSize: data.pageSize ?? 25,
    totalPages: data.totalPages ?? 1,
  };
}

/**
 * @param {{ email: string, displayName?: string, phone?: string, marketingOptIn?: boolean }} body
 */
export async function adminCreateCrmContact(body) {
  if (!neonMode()) return { ok: false, error: 'Mode local' };
  const r = await apiFetch('/api/admin/crm/contacts', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, error: data.error || r.statusText, contact: null };
  return { ok: true, contact: data.contact };
}

/**
 * @param {{ subject: string, htmlContent: string, mode: 'all' | 'selection', contactIds?: string[], onlyOptIn?: boolean, searchQuery?: string }} body
 */
export async function adminCrmSendBulkEmail(body) {
  if (!neonMode()) return { ok: false, error: 'Mode local' };
  const r = await apiFetch('/api/admin/crm/send-email', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, error: data.error || r.statusText, sent: 0, total: 0 };
  return {
    ok: true,
    sent: data.sent ?? 0,
    failed: data.failed ?? 0,
    skipped: data.skipped ?? 0,
    total: data.total ?? 0,
  };
}

export async function updateProfileDisplayName(userId, displayName) {
  if (!userId || !displayName?.trim()) return { ok: false };
  if (neonMode()) {
    const r = await apiFetch('/api/profile', {
      method: 'PATCH',
      body: JSON.stringify({ displayName: displayName.trim() }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: data.error };
    return { ok: true };
  }
  const lu = readLocalUser();
  if (lu && lu.id === userId) {
    lu.displayName = displayName.trim();
    writeLocalUser(lu);
    const acc = readAccounts();
    const i = acc.findIndex((x) => x.id === userId);
    if (i >= 0) {
      acc[i].displayName = displayName.trim();
      writeAccounts(acc);
    }
    return { ok: true };
  }
  return { ok: false };
}
