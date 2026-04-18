import {
  backendMode,
  getSession,
  signIn,
  signUp,
  signOut,
  enroll,
  isEnrolled,
  getProgressMap,
  upsertProgress,
  getCommunityPosts,
  addCommunityPost,
  onAuthChange,
  updateProfileDisplayName,
  loadCatalogSessions,
  fetchNextWebinarEvent,
  fetchWebinarById,
  fetchWebinars,
} from './api.js';
import { COURSE, PLATFORM_BRAND, TAG_LABELS } from './seed-data.js';

/** Mascotte LA FORGE-HUB (alignée sur le header / loader) — ids uniques pour le hero. */
const LANDING_HERO_MASCOT_SVG = `
<svg class="landing-hero-mascot" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="landingHeroMascotGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.98" />
      <stop offset="100%" stop-color="#eef2ff" stop-opacity="0.96" />
    </linearGradient>
  </defs>
  <line x1="20" y1="7" x2="20" y2="11" stroke="rgba(255,255,255,0.95)" stroke-width="2" stroke-linecap="round" />
  <circle cx="20" cy="5" r="3.2" fill="url(#landingHeroMascotGrad)" />
  <circle cx="20" cy="5" r="1.2" fill="#2444eb" opacity="0.32" />
  <ellipse cx="20" cy="23" rx="14" ry="12.5" fill="url(#landingHeroMascotGrad)" />
  <ellipse cx="14" cy="17" rx="5" ry="3" fill="#fff" opacity="0.42" />
  <ellipse cx="13.5" cy="21" rx="3.2" ry="4" fill="#1e2d5c" />
  <ellipse cx="26.5" cy="21" rx="3.2" ry="4" fill="#1e2d5c" />
  <ellipse cx="14.5" cy="19.5" rx="1.1" ry="1.4" fill="#fff" />
  <ellipse cx="27.5" cy="19.5" rx="1.1" ry="1.4" fill="#fff" />
  <ellipse cx="9" cy="25" rx="2.8" ry="1.6" fill="#ff9eb5" opacity="0.78" />
  <ellipse cx="31" cy="25" rx="2.8" ry="1.6" fill="#ff9eb5" opacity="0.78" />
  <path d="M15.5 27.5 Q20 31.5 24.5 27.5" fill="none" stroke="#1e2d5c" stroke-width="1.35" stroke-linecap="round" />
</svg>`;
import {
  renderAdminOverviewHtml,
  renderAdminLessonsHtml,
  renderAdminUsersHtml,
  renderAdminCrmHtml,
  bindAdminLessonsPage,
  bindAdminUsersPage,
  bindAdminCrmPage,
} from './admin.js';
import {
  renderAdminWebinarsHtml,
  bindAdminWebinarsPage,
  renderAdminWebinarDetailHtml,
  bindAdminWebinarDetailPage,
} from './admin-webinars.js';
import {
  renderWebinarsPageHtml,
  renderWebinarDetailHtml,
  readGuestWebinarRegisteredEmail,
  getDashboardWebinarBannerHtml,
  bindDashboardWebinarBanner,
  bindWebinarDetailPage,
} from './webinars-ui.js';
import { pushLoading, popLoading, withLoading } from './loader.js';
import { renderCguPageHtml } from './legal-cgu.js';
import { applySeoMeta, DEFAULT_SITE_DESCRIPTION, truncateMetaDescription } from './seo.js';

/** Rempli au démarrage par `loadCatalogSessions()` (base Neon ou fallback fichier) */
let sessions = [];

/** Ordre d’affichage des modules à l’accueil (filtre « Tout ») */
const TAG_ORDER = ['python', 'math', 'ml', 'dl', 'data', 'framework', 'review'];

let currentUser = null;

export function navigate(path) {
  const base = path.startsWith('/') ? path : `/${path}`;
  window.history.pushState({}, '', base);
  render();
}

function matchRoute() {
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  const parts = path.split('/').filter(Boolean);
  if (parts.length === 0) return { name: 'home' };
  if (parts[0] === 'login') return { name: 'login' };
  if (parts[0] === 'register') return { name: 'register' };
  if (parts[0] === 'dashboard') return { name: 'dashboard' };
  if (parts[0] === 'cgu') return { name: 'cgu' };
  if (parts[0] === 'webinars') {
    if (parts.length === 1) return { name: 'webinars' };
    if (parts.length === 2) return { name: 'webinar-detail', id: parts[1] };
  }
  if (parts[0] === 'admin') {
    if (parts.length === 1) return { name: 'admin' };
    if (parts[1] === 'lessons') return { name: 'admin-lessons' };
    if (parts[1] === 'users') return { name: 'admin-users' };
    if (parts[1] === 'crm') return { name: 'admin-crm' };
    if (parts[1] === 'webinars') {
      if (parts.length === 2) return { name: 'admin-webinars' };
      if (parts.length === 3) return { name: 'admin-webinar-detail', id: parts[2] };
    }
  }
  if (parts[0] === 'course' && parts[1]) return { name: 'course', slug: parts[1] };
  if (parts[0] === 'learn' && parts[1] && parts[2]) {
    return { name: 'learn', slug: parts[1], lessonId: decodeURIComponent(parts[2]) };
  }
  return { name: 'notfound' };
}

function bindRouter() {
  document.body.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-router]');
    if (!a) return;
    const href = a.getAttribute('href');
    if (!href || href.startsWith('http') || href.startsWith('mailto:')) return;
    e.preventDefault();
    navigate(href);
  });
  window.addEventListener('popstate', () => render());
}

function shell(content, opts = {}) {
  const {
    title = PLATFORM_BRAND,
    admin: adminPage = false,
    landing: landingPage = false,
    description,
    image,
    noIndex = false,
  } = opts;
  document.title = title;
  applySeoMeta({
    title,
    description,
    image,
    noIndex: noIndex || adminPage,
  });
  const user = currentUser;
  const dashboardIcon = `<a data-router href="/dashboard" class="nav-dashboard-icon" aria-label="Mon espace" title="Mon espace">
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        </a>`;
  const adminIcon = `<a data-router href="/admin" class="nav-admin-icon" aria-label="Administration" title="Administration">
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
        </a>`;
  const logoutIcon = `<button type="button" class="nav-logout-icon" id="btnLogout" aria-label="Déconnexion" title="Déconnexion">
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
        </button>`;
  return `
    <header class="site-header">
      <div class="header-inner">
        <a data-router href="/" class="brand">
          <span class="brand-mark" aria-hidden="true">
            <svg class="brand-mark-svg" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" focusable="false">
              <defs>
                <linearGradient id="brandMascotFace" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="#ffffff" stop-opacity="0.98" />
                  <stop offset="100%" stop-color="#eef2ff" stop-opacity="0.96" />
                </linearGradient>
              </defs>
              <line x1="20" y1="7" x2="20" y2="11" stroke="rgba(255,255,255,0.95)" stroke-width="2" stroke-linecap="round" />
              <circle cx="20" cy="5" r="3.2" fill="url(#brandMascotFace)" />
              <circle cx="20" cy="5" r="1.2" fill="#2444eb" opacity="0.32" />
              <ellipse cx="20" cy="23" rx="14" ry="12.5" fill="url(#brandMascotFace)" />
              <ellipse cx="14" cy="17" rx="5" ry="3" fill="#fff" opacity="0.42" />
              <ellipse cx="13.5" cy="21" rx="3.2" ry="4" fill="#1e2d5c" />
              <ellipse cx="26.5" cy="21" rx="3.2" ry="4" fill="#1e2d5c" />
              <ellipse cx="14.5" cy="19.5" rx="1.1" ry="1.4" fill="#fff" />
              <ellipse cx="27.5" cy="19.5" rx="1.1" ry="1.4" fill="#fff" />
              <ellipse cx="9" cy="25" rx="2.8" ry="1.6" fill="#ff9eb5" opacity="0.78" />
              <ellipse cx="31" cy="25" rx="2.8" ry="1.6" fill="#ff9eb5" opacity="0.78" />
              <path d="M15.5 27.5 Q20 31.5 24.5 27.5" fill="none" stroke="#1e2d5c" stroke-width="1.35" stroke-linecap="round" />
            </svg>
          </span>
          <span class="brand-text">${escapeHtml(PLATFORM_BRAND)}</span>
        </a>
        <nav class="nav-main" aria-label="Navigation principale">
          <a data-router href="/course/${COURSE.slug}">Formation IA</a>
          <a data-router href="/webinars">Webinaires</a>
        </nav>
        ${
          user
            ? `<div class="nav-header-end"><div class="nav-icon-toolbar">
            ${dashboardIcon}
            ${user.isAdmin ? adminIcon : ''}
            ${logoutIcon}
          </div></div>`
            : ''
        }
      </div>
    </header>
    <main class="site-main ${adminPage ? 'site-main--admin' : ''} ${landingPage ? 'site-main--landing' : ''}">${content}</main>
    <footer class="site-footer">
      <p><strong>${escapeHtml(PLATFORM_BRAND)}</strong> — ${escapeHtml(COURSE.title)} · ${escapeHtml(COURSE.subtitle)}</p>
      <p class="site-footer-links">
        <a data-router href="/cgu">Conditions générales d’utilisation</a>
      </p>
    </footer>
  `;
}

function escapeHtml(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Hero « session » (accueil ou page Formation IA) — même structure visuelle. */
function renderLandingHeroHtml({ title, lead, points, ctaBlock }) {
  const pointsHtml = (points || [])
    .map((p) => `<li>${escapeHtml(p)}</li>`)
    .join('');
  return `
    <div class="landing-hero-fullbleed">
      <section class="landing-hero landing-hero--session surface-card">
        <div class="landing-hero-bg" aria-hidden="true"></div>
        <div class="landing-hero-inner">
          <div class="landing-hero-visual">
            <div class="landing-hero-logo-ring">
              ${LANDING_HERO_MASCOT_SVG}
            </div>
            <p class="landing-hero-brand-name">${escapeHtml(PLATFORM_BRAND)}</p>
            <p class="landing-hero-brand-tagline">${escapeHtml(COURSE.subtitle)}</p>
          </div>
          <div class="landing-hero-main">
            <h1 class="h1 landing-title">${escapeHtml(title)}</h1>
            <p class="landing-lead body-lg">${escapeHtml(lead)}</p>
            <ul class="landing-points">
              ${pointsHtml}
            </ul>
            ${ctaBlock}
          </div>
        </div>
      </section>
    </div>`;
}

async function refreshUser() {
  const { user } = await getSession();
  currentUser = user;
}

async function reloadCatalog() {
  sessions = await loadCatalogSessions();
}

export async function initApp() {
  onAuthChange((u) => {
    currentUser = u;
    render();
  });
  bindRouter();
  await withLoading(async () => {
    await reloadCatalog();
    await refreshUser();
    await render();
  });
}

async function render() {
  pushLoading();
  try {
    await refreshUser();
    const route = matchRoute();
    const app = document.getElementById('app');
    if (!app) return;

    if (route.name === 'home') {
      app.innerHTML = shell(await renderHome(), {
        landing: true,
        title: `${PLATFORM_BRAND} — Formation IA & webinaires`,
        description: DEFAULT_SITE_DESCRIPTION,
      });
    } else if (route.name === 'login') {
      app.innerHTML = shell(renderAuth('login'), {
        title: `Connexion — ${PLATFORM_BRAND}`,
        description: `Connexion à votre compte ${PLATFORM_BRAND} : parcours Machine Learning & IA, progression et webinaires.`,
      });
      bindAuthForm('login');
    } else if (route.name === 'register') {
      app.innerHTML = shell(renderAuth('register'), {
        title: `Inscription — ${PLATFORM_BRAND}`,
        description: `Créez un compte pour suivre le parcours ${COURSE.title}, enregistrer votre progression et participer aux webinaires.`,
      });
      bindAuthForm('register');
    } else if (route.name === 'cgu') {
      app.innerHTML = shell(renderCguPageHtml(), {
        title: `CGU — ${PLATFORM_BRAND}`,
        description: `Conditions générales d’utilisation du site ${PLATFORM_BRAND} : compte, contenus, données personnelles et responsabilités.`,
      });
    } else if (route.name === 'course' && route.slug === COURSE.slug) {
      app.innerHTML = shell(await renderCourse(), {
        title: `${COURSE.title} — Parcours`,
        description: truncateMetaDescription(`${COURSE.title} — ${COURSE.subtitle}. ${COURSE.lead}`),
      });
      bindCourseActions();
    } else if (route.name === 'learn' && route.slug === COURSE.slug) {
      const lesson = findLesson(route.lessonId);
      const learnTitle = lesson ? `${lesson.title} — ${PLATFORM_BRAND}` : `Leçon — ${PLATFORM_BRAND}`;
      const learnDesc = lesson
        ? truncateMetaDescription(`${lesson.title}. Session du parcours « ${COURSE.title} ».`)
        : undefined;
      app.innerHTML = shell(await renderLearn(route.lessonId), {
        title: learnTitle,
        description: learnDesc,
      });
      await bindLearnPage(route.lessonId);
    } else if (route.name === 'webinars') {
      app.innerHTML = shell(await renderWebinarsPageHtml(), {
        title: `Webinaires — ${PLATFORM_BRAND}`,
        description: `Webinaires et replays ${PLATFORM_BRAND} : sessions en direct, inscriptions et visionnage des enregistrements.`,
      });
  } else if (route.name === 'webinar-detail' && route.id) {
    if (route.id === 'next') {
      const next = await fetchNextWebinarEvent();
      if (next.ok && next.webinar?.id) {
        navigate(`/webinars/${next.webinar.id}`);
        return;
      }
      app.innerHTML = shell(
        `<section class="panel surface-card">
          <h1 class="h1">Aucun webinaire à venir</h1>
          <p class="muted">Il n’y a pas de session à venir pour l’instant.</p>
          <a data-router class="btn btn-primary" href="/webinars">Liste des webinaires</a>
        </section>`,
        {
          title: `Webinaires — ${PLATFORM_BRAND}`,
          description: `Aucune session à venir pour l’instant. Consultez la liste des webinaires et replays sur ${PLATFORM_BRAND}.`,
        },
      );
      return;
    }
    let webinarShell = { title: `Webinaire — ${PLATFORM_BRAND}`, description: undefined, image: undefined };
    let webinarPreloaded = null;
    if (backendMode() === 'neon') {
      const guestEmail = readGuestWebinarRegisteredEmail(route.id) || '';
      const [r, allList] = await Promise.all([
        fetchWebinarById(route.id, { guestEmail }),
        fetchWebinars(),
      ]);
      webinarPreloaded = { r, allList };
      if (r.ok && r.webinar) {
        const w = r.webinar;
        webinarShell = {
          title: `${w.title} — Webinaire`,
          description: truncateMetaDescription(`${w.title}. ${w.description || ''}`),
          image: w.bannerUrl && String(w.bannerUrl).trim() ? String(w.bannerUrl).trim() : undefined,
        };
      }
    }
    app.innerHTML = shell(await renderWebinarDetailHtml(route.id, webinarPreloaded), webinarShell);
    bindWebinarDetailPage();
  } else if (route.name === 'dashboard') {
    if (!currentUser) {
      navigate('/login');
      return;
    }
    app.innerHTML = shell(await renderDashboard(), {
      title: `Mon espace — ${PLATFORM_BRAND}`,
      description: `Tableau de bord personnel : progression, leçons et annonces webinaires (${PLATFORM_BRAND}).`,
      noIndex: true,
    });
    bindDashboard();
    bindDashboardWebinarBanner();
  } else if (
    route.name === 'admin' ||
    route.name === 'admin-lessons' ||
    route.name === 'admin-users' ||
    route.name === 'admin-crm' ||
    route.name === 'admin-webinars' ||
    route.name === 'admin-webinar-detail'
  ) {
    if (!currentUser) {
      navigate(`/login?next=${encodeURIComponent('/admin')}`);
      return;
    }
    if (!currentUser.isAdmin) {
      app.innerHTML = shell(renderAdminAccessDenied(), {
        title: `Accès admin — ${PLATFORM_BRAND}`,
        description: 'Espace réservé aux administrateurs.',
        noIndex: true,
      });
      return;
    }
    if (route.name === 'admin') {
      app.innerHTML = shell(await renderAdminOverviewHtml(currentUser), { title: `Administration — ${PLATFORM_BRAND}`, admin: true });
    } else if (route.name === 'admin-lessons') {
      app.innerHTML = shell(await renderAdminLessonsHtml(currentUser), { title: `Admin — Leçons — ${PLATFORM_BRAND}`, admin: true });
      bindAdminLessonsPage({
        reloadCatalog,
        navigate,
      });
    } else if (route.name === 'admin-users') {
      app.innerHTML = shell(await renderAdminUsersHtml(currentUser), { title: `Admin — Utilisateurs — ${PLATFORM_BRAND}`, admin: true });
      bindAdminUsersPage({
        refreshUser,
        currentUserId: currentUser?.id,
      });
    } else if (route.name === 'admin-crm') {
      app.innerHTML = shell(await renderAdminCrmHtml(currentUser), { title: `Admin — CRM — ${PLATFORM_BRAND}`, admin: true });
      bindAdminCrmPage();
    } else if (route.name === 'admin-webinars') {
      app.innerHTML = shell(await renderAdminWebinarsHtml(currentUser), { title: `Admin — Webinaires — ${PLATFORM_BRAND}`, admin: true });
      bindAdminWebinarsPage({ navigate });
    } else if (route.name === 'admin-webinar-detail' && route.id) {
      app.innerHTML = shell(await renderAdminWebinarDetailHtml(currentUser, route.id), {
        title: `Admin — Webinaire — ${PLATFORM_BRAND}`,
        admin: true,
      });
      bindAdminWebinarDetailPage({ navigate });
    }
    } else {
      app.innerHTML = shell(
        `<section class="panel surface-card text-center"><h1 class="h1">Page introuvable</h1><p><a data-router href="/">Retour à l'accueil</a></p></section>`,
        {
          title: `Page introuvable — ${PLATFORM_BRAND}`,
          description: 'La page demandée n’existe pas ou a été déplacée.',
          noIndex: true,
        },
      );
    }

    const logout = document.getElementById('btnLogout');
    if (logout) {
      logout.addEventListener('click', async () => {
        await signOut();
        currentUser = null;
        navigate('/');
      });
    }
  } finally {
    popLoading();
  }
}

function initCourseVideoCatalog(els) {
  const { filterBar, videoList, noResults, countNum } = els;
  if (!filterBar || !videoList || !noResults || !countNum) return;

  function doRender(filter = 'all') {
    videoList.innerHTML = '';
    const filtered = filter === 'all' ? sessions : sessions.filter((s) => s.tag === filter);
    if (filtered.length === 0) {
      noResults.style.display = 'block';
      countNum.textContent = '0';
      return;
    }
    noResults.style.display = 'none';
    countNum.textContent = String(filtered.length);
    const groups = {};
    filtered.forEach((s) => {
      if (!groups[s.tag]) groups[s.tag] = [];
      groups[s.tag].push(s);
    });
    Object.keys(groups).forEach((tag) => {
      groups[tag].sort((a, b) => a.date - b.date);
    });
    const keysToShow = filter === 'all' ? TAG_ORDER.filter((t) => groups[t]?.length) : [filter];

    keysToShow.forEach((tagKey, gi) => {
      const items = groups[tagKey];
      if (!items?.length) return;
      const group = document.createElement('div');
      group.className = 'module-group';
      group.style.animationDelay = `${0.05 * gi}s`;
      const label = document.createElement('div');
      label.className = 'module-label';
      label.textContent = TAG_LABELS[tagKey] || tagKey;
      group.appendChild(label);
      items.forEach((s) => {
        const row = document.createElement('a');
        row.className = 'video-row';
        row.dataset.router = '';
        row.href = `/learn/${COURSE.slug}/${encodeURIComponent(s.lessonId)}`;
        row.innerHTML = `
            <div class="video-date">${s.weekday} ${s.day}</div>
            <div class="video-title">${escapeHtml(s.title)}</div>
            <div class="play-icon"><svg viewBox="0 0 12 14"><polygon points="0,0 12,7 0,14"/></svg></div>`;
        group.appendChild(row);
      });
      videoList.appendChild(group);
    });
  }

  filterBar.addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-btn');
    if (!btn) return;
    filterBar.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    doRender(btn.dataset.filter);
  });
  doRender('all');
}

async function renderHome() {
  const enrolled = currentUser ? await isEnrolled(currentUser.id) : false;
  const progress = currentUser ? await getProgressMap(currentUser.id) : {};
  const lastIncomplete = sessions.find((s) => !progress[s.lessonId]?.completed);
  const firstLessonId = sessions[0]?.lessonId;
  const continueHref =
    enrolled && lastIncomplete
      ? `/learn/${COURSE.slug}/${encodeURIComponent(lastIncomplete.lessonId)}`
      : enrolled && firstLessonId
        ? `/learn/${COURSE.slug}/${encodeURIComponent(firstLessonId)}`
        : `/course/${COURSE.slug}`;

  const homeTitle = 'La Forge Hub';
  const homeLead =
    'La Forge Hub propose une formation en intelligence artificielle et des webinaires pour développer vos soft skills — tout au même endroit.';

  const homePoints = [
    'Parcours vidéo structuré : Python, données, machine learning et deep learning',
    'Webinaires et replays sur l’IA et le développement des soft skills',
  ];

  const ctaBlock = !currentUser
    ? `<div class="landing-cta">
        <a data-router class="btn btn-primary btn-lg" href="/course/${COURSE.slug}">Voir le catalogue Formation IA</a>
        <a data-router class="btn btn-secondary btn-lg" href="/webinars">Voir les webinaires</a>
      </div>`
    : enrolled
      ? `<div class="landing-cta">
        <a data-router class="btn btn-primary btn-lg" href="${continueHref}">Continuer le parcours</a>
        <a data-router class="btn btn-secondary btn-lg" href="/webinars">Voir les webinaires</a>
      </div>`
      : `<div class="landing-cta">
        <a data-router class="btn btn-primary btn-lg" href="/course/${COURSE.slug}">Voir le parcours et s’inscrire</a>
        <a data-router class="btn btn-secondary btn-lg" href="/webinars">Voir les webinaires</a>
      </div>`;

  return `
    <div class="landing-page home-landing">
      ${renderLandingHeroHtml({
        title: homeTitle,
        lead: homeLead,
        points: homePoints,
        ctaBlock,
      })}
    </div>`;
}

function renderAuth(mode) {
  const isLogin = mode === 'login';
  return `
    <section class="auth-panel">
      <h1 class="h1">${isLogin ? 'Connexion' : 'Créer un compte'}</h1>
      <p class="muted">${isLogin ? 'Accédez à votre progression et à la communauté.' : 'Rejoignez le parcours et suivez vos leçons.'}</p>
      <form id="authForm" class="form-stack">
        ${isLogin ? '' : `<label>Nom affiché<input type="text" name="displayName" autocomplete="name" required /></label>`}
        <label>E-mail<input type="email" name="email" autocomplete="email" required /></label>
        <label>Mot de passe<input type="password" name="password" autocomplete="${isLogin ? 'current-password' : 'new-password'}" required minlength="6" /></label>
        <p id="authError" class="form-error" role="alert"></p>
        <button type="submit" class="btn btn-primary btn-block">${isLogin ? 'Se connecter' : "S'inscrire"}</button>
      </form>
      <p class="text-center muted">
        ${isLogin ? `Pas encore de compte ? <a data-router href="/register">S'inscrire</a>` : `Déjà un compte ? <a data-router href="/login">Connexion</a>`}
      </p>
    </section>
  `;
}

function bindAuthForm(mode) {
  const form = document.getElementById('authForm');
  const err = document.getElementById('authError');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.textContent = '';
    const fd = new FormData(form);
    const email = String(fd.get('email') || '').trim();
    const password = String(fd.get('password') || '');
    if (mode === 'register') {
      const displayName = String(fd.get('displayName') || '').trim();
      const res = await signUp(email, password, displayName);
      if (!res.ok) {
        err.textContent = res.error || 'Erreur';
        return;
      }
      await refreshUser();
      navigate(`/course/${COURSE.slug}`);
      return;
    }
    const res = await signIn(email, password);
    if (!res.ok) {
      err.textContent = res.error || 'Erreur';
      return;
    }
    await refreshUser();
    const next = new URLSearchParams(window.location.search).get('next');
    const safe =
      next && next.startsWith('/') && !next.startsWith('//') && !next.includes(':')
        ? next
        : null;
    navigate(safe || '/dashboard');
  });
}

async function renderCourse() {
  const enrolled = currentUser ? await isEnrolled(currentUser.id) : false;
  const progress = currentUser ? await getProgressMap(currentUser.id) : {};
  const lastIncomplete = sessions.find((s) => !progress[s.lessonId]?.completed);
  const firstLessonId = sessions[0]?.lessonId;
  const continueHref =
    enrolled && lastIncomplete
      ? `/learn/${COURSE.slug}/${encodeURIComponent(lastIncomplete.lessonId)}`
      : enrolled && firstLessonId
        ? `/learn/${COURSE.slug}/${encodeURIComponent(firstLessonId)}`
        : `/course/${COURSE.slug}`;

  const categories = new Set(sessions.map((s) => s.tag)).size;

  const courseHeroPoints = [
    'Vidéos progressives · Python, données, machine learning & deep learning',
    'Progression suivie, communauté par leçon, webinaires',
    'Open & orienté pratique',
  ];

  const courseCtaBlock = !currentUser
    ? `<div class="landing-cta">
        <a data-router class="btn btn-primary btn-lg" href="/login">Connectez-vous pour vous inscrire</a>
        <a data-router class="btn btn-secondary btn-lg" href="/register">Créer un compte</a>
      </div>`
    : enrolled
      ? `<div class="landing-cta">
        <a data-router class="btn btn-primary btn-lg" href="${continueHref}">Continuer la formation</a>
        <a data-router class="btn btn-secondary btn-lg" href="/dashboard">Mon espace</a>
      </div>`
      : `<div class="landing-cta landing-cta--enroll">
        <label class="landing-marketing-opt landing-terms-opt">
          <input type="checkbox" id="acceptTermsEnroll" />
          <span>J’ai lu et j’accepte les <a data-router href="/cgu" class="inline-legal-link">conditions générales d’utilisation</a> de La Forge Hub.</span>
        </label>
        <label class="landing-marketing-opt">
          <input type="checkbox" id="enrollMarketingOptIn" />
          <span>J’accepte de recevoir des e-mails pour les annonces des prochaines activités de La Forge Hub (webinaires, formation).</span>
        </label>
        <button type="button" class="btn btn-primary btn-lg" id="btnEnroll" disabled aria-disabled="true">S'inscrire au parcours</button>
      </div>`;

  return `
    <div class="course-page course-page--with-hero">
      ${renderLandingHeroHtml({
        title: COURSE.title,
        lead: COURSE.lead,
        points: courseHeroPoints,
        ctaBlock: courseCtaBlock,
      })}
      <section class="course-catalog-block" aria-labelledby="courseCatalogHeading">
        <h2 class="h2" id="courseCatalogHeading">Catalogue des leçons</h2>
        <p class="muted course-catalog-lead">Filtrez par thématique ou ouvrez une session pour la lire (connexion et inscription au parcours requises pour le lecteur).</p>
        <div class="stats-strip surface-low" id="courseStatsBar">
          <div class="stat"><div class="stat-num">${sessions.length}</div><div class="stat-label">sessions vidéo</div></div>
          <div class="stat"><div class="stat-num">${categories}</div><div class="stat-label">modules</div></div>
          <div class="stat"><div class="stat-num">100%</div><div class="stat-label">open</div></div>
        </div>
        <div class="filter-bar" id="courseFilterBar">
          <button type="button" class="filter-btn active" data-filter="all">Tout</button>
          <button type="button" class="filter-btn" data-filter="python">Python</button>
          <button type="button" class="filter-btn" data-filter="math">Maths</button>
          <button type="button" class="filter-btn" data-filter="ml">Machine Learning</button>
          <button type="button" class="filter-btn" data-filter="dl">Deep Learning</button>
          <button type="button" class="filter-btn" data-filter="data">Data Analysis</button>
          <button type="button" class="filter-btn" data-filter="framework">Frameworks</button>
          <button type="button" class="filter-btn" data-filter="review">Reviews</button>
        </div>
        <div class="video-list" id="courseVideoList"></div>
        <div class="no-results" id="courseNoResults" style="display:none">Aucune session trouvée pour ce filtre.</div>
        <div class="session-counter glass-fab"><span id="courseCountNum">${sessions.length}</span> sessions listées</div>
      </section>
    </div>
  `;
}

function bindCourseActions() {
  const btn = document.getElementById('btnEnroll');
  const termsCb = document.getElementById('acceptTermsEnroll');
  if (btn && currentUser) {
    function syncEnrollButton() {
      const ok = termsCb instanceof HTMLInputElement && termsCb.checked;
      btn.disabled = !ok;
      btn.setAttribute('aria-disabled', ok ? 'false' : 'true');
    }
    termsCb?.addEventListener('change', syncEnrollButton);
    syncEnrollButton();
    btn.addEventListener('click', async () => {
      if (termsCb instanceof HTMLInputElement && !termsCb.checked) return;
      const marketingCb = document.getElementById('enrollMarketingOptIn');
      const marketingOptIn = marketingCb instanceof HTMLInputElement && marketingCb.checked;
      const r = await enroll(currentUser.id, COURSE.slug, marketingOptIn);
      if (!r.ok) {
        alert(r.error || "Impossible de s'inscrire");
        return;
      }
      navigate(`/learn/${COURSE.slug}/${encodeURIComponent(sessions[0].lessonId)}`);
    });
  }
  initCourseVideoCatalog({
    filterBar: document.getElementById('courseFilterBar'),
    videoList: document.getElementById('courseVideoList'),
    noResults: document.getElementById('courseNoResults'),
    countNum: document.getElementById('courseCountNum'),
  });
}

async function renderDashboard() {
  const progress = await getProgressMap(currentUser.id);
  const done = Object.values(progress).filter((p) => p.completed).length;
  const pct = sessions.length ? Math.round((done / sessions.length) * 100) : 0;
  const lastIncomplete = sessions.find((s) => !progress[s.lessonId]?.completed);
  const webinarBanner = await getDashboardWebinarBannerHtml();

  return `
    <section class="panel surface-card">
      <h1 class="h1">Mon espace</h1>
      <p class="muted">Bonjour ${escapeHtml(currentUser.displayName || '')}</p>
      ${webinarBanner}
      <div class="dash-grid">
        <div class="dash-card">
          <div class="dash-ring" style="--p:${pct}"><span>${pct}%</span></div>
          <p>Parcours complété</p>
        </div>
        <div class="dash-card">
          <div class="stat-num">${done}</div>
          <p>Leçons terminées</p>
        </div>
        <div class="dash-card">
          <div class="stat-num">${sessions.length}</div>
          <p>Leçons au total</p>
        </div>
      </div>
      <div class="dash-actions">
        ${
          lastIncomplete
            ? `<a data-router class="btn btn-primary" href="/learn/${COURSE.slug}/${encodeURIComponent(lastIncomplete.lessonId)}">Reprendre la formation</a>`
            : `<a data-router class="btn btn-primary" href="/learn/${COURSE.slug}/${encodeURIComponent(sessions[0].lessonId)}">Revoir le début</a>`
        }
        <a data-router class="btn btn-secondary" href="/course/${COURSE.slug}">Fiche du parcours</a>
      </div>
      <h2 class="h2 section-title">Profil</h2>
      <form id="profileForm" class="form-inline">
        <label>Nom affiché<input type="text" name="displayName" value="${escapeHtml(currentUser.displayName || '')}" /></label>
        <button type="submit" class="btn btn-primary">Enregistrer</button>
        <span id="profileMsg" class="muted"></span>
      </form>
    </section>
  `;
}

function bindDashboard() {
  const form = document.getElementById('profileForm');
  const msg = document.getElementById('profileMsg');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const dn = String(fd.get('displayName') || '').trim();
    const r = await updateProfileDisplayName(currentUser.id, dn);
    if (!r.ok) {
      msg.textContent = r.error || 'Erreur';
      return;
    }
    currentUser = { ...currentUser, displayName: dn };
    msg.textContent = 'Enregistré.';
    setTimeout(() => {
      msg.textContent = '';
    }, 2000);
  });
}

function findLesson(lessonId) {
  return sessions.find((s) => s.lessonId === lessonId);
}

async function renderLearn(lessonId) {
  const lesson = findLesson(lessonId);
  if (!lesson) {
    return `<section class="panel surface-card"><p>Leçon introuvable.</p><a data-router href="/course/${COURSE.slug}">Retour</a></section>`;
  }

  if (!currentUser) {
    return `
      <section class="panel surface-card">
        <h1 class="h1">${escapeHtml(lesson.title)}</h1>
        <p>Connectez-vous pour suivre la leçon et enregistrer votre progression.</p>
        <a data-router class="btn btn-primary" href="/login">Connexion</a>
        <a data-router class="btn btn-secondary" href="/register">Créer un compte</a>
      </section>`;
  }

  const enrolled = await isEnrolled(currentUser.id);
  if (!enrolled) {
    return `
      <section class="panel surface-card">
        <h1 class="h1">${escapeHtml(lesson.title)}</h1>
        <p>Inscrivez-vous au parcours pour accéder au lecteur et à la communauté.</p>
        <a data-router class="btn btn-primary" href="/course/${COURSE.slug}">Voir le parcours</a>
      </section>`;
  }

  const idx = sessions.indexOf(lesson);
  const prev = idx > 0 ? sessions[idx - 1] : null;
  const next = idx < sessions.length - 1 ? sessions[idx + 1] : null;
  const progress = await getProgressMap(currentUser.id);
  const p = progress[lessonId] || {};

  const sidebar = sessions
    .map((s, i) => {
      const done = progress[s.lessonId]?.completed;
      const active = s.lessonId === lessonId;
      const mark = done
        ? `<span class="ci-done" aria-hidden="true" title="Terminée"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>`
        : `<span class="ci-num">${i + 1}</span>`;
      return `<a data-router class="curriculum-item ${active ? 'active' : ''} ${done ? 'done' : ''}" href="/learn/${COURSE.slug}/${encodeURIComponent(s.lessonId)}">
        ${mark}<span class="ci-title">${escapeHtml(s.title)}</span>
      </a>`;
    })
    .join('');

  return `
    <div class="learn-layout">
      <div class="learn-main">
        <div class="learn-breadcrumb muted">
          <a data-router href="/course/${COURSE.slug}">Parcours</a> · Leçon ${idx + 1} / ${sessions.length}
        </div>
        <h1 class="h1 learn-title">${escapeHtml(lesson.title)}</h1>
        <div class="video-wrap">
          <iframe id="ytFrame" class="video-iframe" src="https://www.youtube.com/embed/${lesson.youtubeId}?enablejsapi=1" title="${escapeHtml(lesson.title)}"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
        </div>
        ${
          lesson.collabUrl
            ? `<section class="collab-panel surface-card">
          <h2 class="h3">Notebook / corrigé (Colab)</h2>
          <p class="muted small">Ressource liée à cette session — ouvrir dans un nouvel onglet.</p>
          <a href="${escapeHtml(lesson.collabUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-primary">Ouvrir le notebook</a>
        </section>`
            : ''
        }
        <div class="learn-toolbar">
          <label class="check-complete"><input type="checkbox" id="chkComplete" ${p.completed ? 'checked' : ''} /> Marquer comme terminée</label>
          <span id="saveHint" class="muted small"></span>
          <div class="nav-prev-next">
            ${prev ? `<a data-router class="btn btn-secondary btn-sm" href="/learn/${COURSE.slug}/${encodeURIComponent(prev.lessonId)}">← Précédent</a>` : `<span></span>`}
            ${next ? `<a data-router class="btn btn-secondary btn-sm" href="/learn/${COURSE.slug}/${encodeURIComponent(next.lessonId)}">Suivant →</a>` : `<span></span>`}
          </div>
        </div>
        <section class="community-section">
          <h2 class="h2">Communauté — questions & échanges</h2>
          <form id="postForm" class="form-stack">
            <label>Votre message<textarea name="body" rows="3" placeholder="Posez une question ou partagez une ressource…" required></textarea></label>
            <button type="submit" class="btn btn-primary">Publier</button>
            <p id="postError" class="form-error"></p>
          </form>
          <div id="postsList" class="posts-list"></div>
        </section>
      </div>
      <aside class="learn-sidebar">
        <h3 class="sidebar-title">Programme</h3>
        <div class="curriculum">${sidebar}</div>
      </aside>
    </div>
  `;
}

async function bindLearnPage(lessonId) {
  const lesson = findLesson(lessonId);
  if (!lesson || !currentUser) return;
  const enrolled = await isEnrolled(currentUser.id);
  if (!enrolled) return;

  const chk = document.getElementById('chkComplete');
  const hint = document.getElementById('saveHint');
  const postForm = document.getElementById('postForm');
  const postError = document.getElementById('postError');
  const postsList = document.getElementById('postsList');

  async function saveProgress(extra = {}) {
    const completed = chk?.checked ?? false;
    const r = await upsertProgress(currentUser.id, lessonId, {
      completed,
      last_position_sec: extra.last_position_sec ?? 0,
    });
    if (r.ok) {
      hint.textContent = 'Progression enregistrée';
      setTimeout(() => {
        hint.textContent = '';
      }, 1500);
    }
  }

  if (chk) {
    chk.addEventListener('change', () => saveProgress());
  }

  async function loadPosts() {
    const { posts, error } = await getCommunityPosts(lessonId);
    if (error) {
      postsList.innerHTML = `<p class="muted">${escapeHtml(error)}</p>`;
      return;
    }
    if (!posts.length) {
      postsList.innerHTML = '<p class="muted">Aucun message pour l’instant. Lancez la discussion.</p>';
      return;
    }
    postsList.innerHTML = posts
      .map(
        (p) => `
      <article class="post-card">
        <header><strong>${escapeHtml(p.display_name || 'Membre')}</strong> · <time>${new Date(p.created_at).toLocaleString('fr-FR')}</time></header>
        <p>${escapeHtml(p.body).replace(/\n/g, '<br/>')}</p>
      </article>`,
      )
      .join('');
  }

  await loadPosts();

  if (postForm) {
    postForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      postError.textContent = '';
      const fd = new FormData(postForm);
      const body = String(fd.get('body') || '');
      const r = await addCommunityPost(currentUser.id, lessonId, body);
      if (!r.ok) {
        postError.textContent = r.error || 'Erreur';
        return;
      }
      postForm.reset();
      await loadPosts();
    });
  }
}

function renderAdminAccessDenied() {
  const email = currentUser?.email ? escapeHtml(currentUser.email) : '';
  const neon = backendMode() === 'neon';
  return `
    <section class="panel surface-card admin-access-denied">
      <h1 class="h1">Accès administrateur refusé</h1>
      <p class="body-lg">Vous êtes connecté avec <strong>${email}</strong>, mais ce compte n’est pas reconnu comme administrateur.</p>
      <ul class="muted admin-checklist">
        <li>L’administration est liée au rôle <strong>admin</strong> dans la table <code>users</code> (colonne <code>role</code>), pas au fichier <code>.env</code>.</li>
        <li>Promouvoir votre compte : à la racine du projet, <code>npm run admin:promote -- votre@email.com</code> avec la même adresse qu’en base, puis déconnectez-vous / reconnectez-vous.</li>
        <li>Autre option : <code>npx prisma studio</code> → ouvrir l’utilisateur → mettre <code>role</code> à <code>admin</code>.</li>
        <li>Utilisez <strong>npm run dev</strong> (API + interface) pour que <code>/api/me</code> renvoie le bon rôle.</li>
      </ul>
      <p class="muted small">Mode actuel côté app : <strong>${neon ? 'Neon (API)' : 'local navigateur'}</strong>. L’admin des leçons nécessite le mode Neon avec API joignable.</p>
      <div class="hero-cta">
        <a data-router class="btn btn-secondary" href="/">Accueil</a>
        <a data-router class="btn btn-ghost" href="/login">Changer de compte</a>
      </div>
    </section>`;
}

