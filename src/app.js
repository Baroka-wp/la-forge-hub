import {
  backendMode,
  getSession,
  signIn,
  signUp,
  signOut,
  requestPasswordReset,
  resetPassword,
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

/** Marque La Forge : une enclume construite en blocs et ses étincelles pixel. */
const BRAND_MARK_SVG = `
<svg class="landing-hero-mascot" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
  <rect x="16" y="30" width="32" height="7" rx="2" fill="currentColor"/>
  <rect x="24" y="37" width="16" height="6" rx="2" fill="currentColor" opacity=".76"/>
  <rect x="19" y="43" width="26" height="6" rx="2" fill="currentColor"/>
  <rect x="29" y="14" width="6" height="6" rx="1.6" fill="#5FD9A6"/>
  <rect x="38" y="20" width="5" height="5" rx="1.4" fill="#18A16C"/>
  <rect x="21" y="21" width="4" height="4" rx="1.2" fill="#5FD9A6" opacity=".72"/>
</svg>`;
import {
  renderAdminOverviewHtml,
  renderAdminLessonsHtml,
  renderAdminUsersHtml,
  renderAdminUserDetailHtml,
  renderAdminCrmHtml,
  bindAdminLessonsPage,
  bindAdminUsersPage,
  bindAdminUserDetailPage,
  bindAdminCrmPage,
} from './admin.js';
import {
  renderAdminWebinarsHtml,
  bindAdminWebinarsPage,
  renderAdminWebinarDetailHtml,
  bindAdminWebinarDetailPage,
} from './admin-webinars.js';
import { renderAdminAttestationsHtml, bindAdminAttestationsPage } from './admin-attestations.js';
import {
  renderWebinarsPageHtml,
  renderWebinarDetailHtml,
  readGuestWebinarRegisteredEmail,
  getDashboardWebinarBannerHtml,
  bindDashboardWebinarBanner,
  bindWebinarDetailPage,
  bindWebinarsListPage,
} from './webinars-ui.js';
import { pushLoading, popLoading, withLoading } from './loader.js';
import { renderCguPageHtml } from './legal-cgu.js';
import { renderAttestationsPageHtml, bindAttestationsPage } from './attestations.js';
import { matchEmonosSection, renderEmonosPageHtml, bindEmonosPage } from './emonos/index.js';
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
  if (parts[0] === 'forgot-password') return { name: 'forgot-password' };
  if (parts[0] === 'reset-password') return { name: 'reset-password' };
  if (parts[0] === 'dashboard') return { name: 'dashboard' };
  if (parts[0] === 'cgu') return { name: 'cgu' };
  /** Page non listée dans le menu — accès par lien direct uniquement. */
  if (parts[0] === 'attestations') return { name: 'attestations' };
  /** EMONOS — espace de travail plein écran (rail de sections interne). */
  if (parts[0] === 'emonos') {
    const section = matchEmonosSection(path);
    if (section) return { name: 'emonos', section };
  }
  if (parts[0] === 'webinars') {
    if (parts.length === 1) return { name: 'webinars' };
    if (parts.length === 2) return { name: 'webinar-detail', id: parts[1] };
  }
  if (parts[0] === 'admin') {
    if (parts.length === 1) return { name: 'admin' };
    if (parts[1] === 'lessons') return { name: 'admin-lessons' };
    if (parts[1] === 'users') {
      if (parts.length === 2) return { name: 'admin-users' };
      if (parts.length === 3) return { name: 'admin-user-detail', id: parts[2] };
    }
    if (parts[1] === 'crm') return { name: 'admin-crm' };
    if (parts[1] === 'attestations') return { name: 'admin-attestations' };
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

function closeNavDrawer() {
  document.body.classList.remove('nav-drawer-open');
  const drawer = document.getElementById('navDrawer');
  const toggle = document.getElementById('navMenuToggle');
  if (!drawer || !toggle) return;
  drawer.classList.remove('is-open');
  drawer.setAttribute('aria-hidden', 'true');
  toggle.setAttribute('aria-expanded', 'false');
  toggle.focus();
}

function openNavDrawer() {
  if (typeof window !== 'undefined' && window.matchMedia('(min-width: 769px)').matches) return;
  const drawer = document.getElementById('navDrawer');
  const toggle = document.getElementById('navMenuToggle');
  const closeBtn = document.getElementById('navDrawerClose');
  if (!drawer || !toggle) return;
  drawer.classList.add('is-open');
  drawer.setAttribute('aria-hidden', 'false');
  toggle.setAttribute('aria-expanded', 'true');
  document.body.classList.add('nav-drawer-open');
  closeBtn?.focus();
}

/** Un seul jeu d’écouteurs (le DOM est recréé à chaque render). */
function bindMobileNavOnce() {
  if (bindMobileNavOnce._done) return;
  bindMobileNavOnce._done = true;

  document.addEventListener('click', (e) => {
    if (e.target.closest('#navMenuToggle')) {
      e.preventDefault();
      const drawer = document.getElementById('navDrawer');
      if (drawer?.classList.contains('is-open')) closeNavDrawer();
      else openNavDrawer();
      return;
    }
    if (e.target.closest('#navDrawerBackdrop') || e.target.closest('#navDrawerClose')) {
      closeNavDrawer();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const drawer = document.getElementById('navDrawer');
    if (drawer?.classList.contains('is-open')) {
      e.preventDefault();
      closeNavDrawer();
    }
  });

  window.addEventListener('resize', () => {
    const drawer = document.getElementById('navDrawer');
    if (window.matchMedia('(min-width: 769px)').matches && drawer?.classList.contains('is-open')) {
      closeNavDrawer();
    }
  });
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
  const drawerAccountBlock = user
    ? `<hr class="nav-drawer-sep" />
        <div class="nav-drawer-account">
          <a data-router href="/dashboard" class="nav-drawer-account-link">Mon espace</a>
          ${user.isAdmin ? `<a data-router href="/admin" class="nav-drawer-account-link">Administration</a>` : ''}
          <button type="button" class="nav-drawer-logout" id="btnLogoutDrawer">Déconnexion</button>
        </div>`
    : '';
  return `
    <a class="skip-link" href="#main-content">Aller au contenu</a>
    <header class="site-header">
      <div class="header-inner">
        <button type="button" class="nav-menu-toggle" id="navMenuToggle" aria-expanded="false" aria-controls="navDrawerPanel" aria-label="Ouvrir le menu">
          <span class="nav-menu-toggle-bars" aria-hidden="true"></span>
        </button>
        <a data-router href="/" class="brand" aria-label="Accueil La Forge Hub">
          <span class="brand-mark" aria-hidden="true">
            ${BRAND_MARK_SVG.replace('landing-hero-mascot', 'brand-mark-svg')}
          </span>
          <span class="brand-lockup"><span class="brand-text">LA FORGE <em>HUB</em></span><span class="brand-tagline">Apprendre · Construire · Créer</span></span>
        </a>
        <nav class="nav-main nav-main--desktop" aria-label="Navigation principale">
          <a data-router href="/course/${COURSE.slug}" class="nav-main-primary">Parcours</a>
          <a data-router href="/webinars" class="nav-main-secondary">Ateliers &amp; replays</a>
        </nav>
        ${
          user
            ? `<div class="nav-header-end nav-header-end--desktop"><div class="nav-icon-toolbar">
            ${dashboardIcon}
            ${user.isAdmin ? adminIcon : ''}
            ${logoutIcon}
          </div></div>`
            : ''
        }
      </div>
    </header>
    <div id="navDrawer" class="nav-drawer" aria-hidden="true">
      <div class="nav-drawer-backdrop" id="navDrawerBackdrop" tabindex="-1"></div>
      <div
        id="navDrawerPanel"
        class="nav-drawer-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="navDrawerTitle"
      >
        <h2 id="navDrawerTitle" class="nav-drawer-title">Menu de navigation</h2>
        <button type="button" class="nav-drawer-close" id="navDrawerClose" aria-label="Fermer le menu">×</button>
        <nav class="nav-drawer-links" aria-label="Navigation principale">
          <a data-router href="/course/${COURSE.slug}">Parcours</a>
          <a data-router href="/webinars">Ateliers &amp; replays</a>
        </nav>
        ${drawerAccountBlock}
      </div>
    </div>
    <main id="main-content" class="site-main ${adminPage ? 'site-main--admin' : ''} ${landingPage ? 'site-main--landing' : ''}">${content}</main>
    <footer class="site-footer">
      <div class="site-footer-cols">
        <div class="site-footer-col">
          <p class="site-footer-brand"><strong>${escapeHtml(PLATFORM_BRAND)}</strong></p>
          <p class="site-footer-tagline">Apprendre l’IA, les maths et le code à son rythme.</p>
        </div>
        <div class="site-footer-col">
          <p class="site-footer-col-title">Ateliers</p>
          <a data-router href="/webinars">Toutes les sessions</a>
          <a data-router href="/webinars#replays">Replays</a>
        </div>
        <div class="site-footer-col">
          <p class="site-footer-col-title">Apprendre</p>
          <a data-router href="/course/${COURSE.slug}">Parcours ${escapeHtml(COURSE.title)}</a>
        </div>
        <div class="site-footer-col">
          <p class="site-footer-col-title">Légal</p>
          <a data-router href="/cgu">Conditions générales d’utilisation</a>
        </div>
      </div>
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

/** Paragraphe description leçon — rien si vide ou blanc. */
function lessonDescriptionBlock(lesson) {
  const t = lesson?.description != null ? String(lesson.description).trim() : '';
  if (!t) return '';
  return `<p class="learn-desc">${escapeHtml(t)}</p>`;
}

/** Bloc lien notebook (Colab, etc.) — rien si pas d’URL utile. */
function lessonCollabBlock(lesson) {
  const url = lesson?.collabUrl != null ? String(lesson.collabUrl).trim() : '';
  if (!url) return '';
  return `<section class="collab-panel surface-card">
          <div class="collab-panel-head">
            <h2 class="h3 collab-panel-title">Notebook / corrigé</h2>
            <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="btn btn-primary collab-panel-btn">Ouvrir le notebook</a>
          </div>
        </section>`;
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
              ${BRAND_MARK_SVG}
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
  bindMobileNavOnce();
  await withLoading(async () => {
    await reloadCatalog();
    await refreshUser();
    await render();
  });
}

async function render() {
  pushLoading();
  try {
    document.body.classList.remove('nav-drawer-open');
    await refreshUser();
    const route = matchRoute();
    const app = document.getElementById('app');
    if (!app) return;
    /** EMONOS occupe tout l'écran : le fond et le défilement changent de règles. */
    document.body.classList.toggle('emonos-mode', route.name === 'emonos');

    if (route.name === 'home') {
      app.innerHTML = shell(await renderHome(), {
        title: `${PLATFORM_BRAND} — Formations Pro & conférences tech`,
        description: DEFAULT_SITE_DESCRIPTION,
      });
      bindHomeOptinForm();
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
    } else if (route.name === 'forgot-password') {
      app.innerHTML = shell(renderForgotPassword(), {
        title: `Mot de passe oublié — ${PLATFORM_BRAND}`,
        description: `Recevez un lien sécurisé pour réinitialiser votre mot de passe ${PLATFORM_BRAND}.`,
      });
      bindForgotPasswordForm();
    } else if (route.name === 'reset-password') {
      app.innerHTML = shell(renderResetPassword(), {
        title: `Nouveau mot de passe — ${PLATFORM_BRAND}`,
        description: `Choisissez un nouveau mot de passe pour votre compte ${PLATFORM_BRAND}.`,
      });
      bindResetPasswordForm();
    } else if (route.name === 'cgu') {
      app.innerHTML = shell(renderCguPageHtml(), {
        title: `CGU — ${PLATFORM_BRAND}`,
        description: `Conditions générales d’utilisation du site ${PLATFORM_BRAND} : compte, contenus, données personnelles et responsabilités.`,
      });
    } else if (route.name === 'attestations') {
      applySeoMeta({
        title: 'Attestation de participation NOAI 2026',
        description:
          'Espace de retrait des attestations de participation aux Olympiades Nationales d’Intelligence Artificielle 2026.',
        noIndex: true,
      });
      document.title = 'Attestation de participation NOAI 2026';
      app.innerHTML = renderAttestationsPageHtml();
      bindAttestationsPage();
      return;
    } else if (route.name === 'emonos') {
      if (!currentUser) {
        navigate(`/login?next=${encodeURIComponent(window.location.pathname)}`);
        return;
      }
      /** Application plein écran : pas de coquille marketing autour. */
      app.innerHTML = renderEmonosPageHtml(route.section);
      applySeoMeta({
        title: `EMONOS — Task Automation — ${PLATFORM_BRAND}`,
        description: 'Gestion de projets, tâches, workflows et documents.',
        noIndex: true,
      });
      await bindEmonosPage(route.section, { navigate });
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
        title: `Formations Pro — ${PLATFORM_BRAND}`,
        description: `Formations Professionnelles ${PLATFORM_BRAND} : sessions en direct, inscriptions et visionnage des replays.`,
      });
      bindWebinarsListPage();
  } else if (route.name === 'webinar-detail' && route.id) {
    if (route.id === 'next') {
      const next = await fetchNextWebinarEvent();
      if (next.ok && next.webinar?.id) {
        navigate(`/webinars/${next.webinar.id}`);
        return;
      }
      app.innerHTML = shell(
        `<section class="panel surface-card">
          <h1 class="h1">Aucune session à venir</h1>
          <p class="muted">Il n’y a pas de session à venir pour l’instant.</p>
          <a data-router class="btn btn-primary" href="/webinars">Voir les formations Pro</a>
        </section>`,
        {
          title: `Formations Pro — ${PLATFORM_BRAND}`,
          description: `Aucune session à venir pour l’instant. Consultez la liste des formations Pro et replays sur ${PLATFORM_BRAND}.`,
        },
      );
      return;
    }
    let webinarShell = { title: `Formation Pro — ${PLATFORM_BRAND}`, description: undefined, image: undefined };
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
          title: `${w.title} — Formation Pro`,
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
    route.name === 'admin-user-detail' ||
    route.name === 'admin-crm' ||
    route.name === 'admin-attestations' ||
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
        navigate,
        currentUserId: currentUser?.id,
      });
    } else if (route.name === 'admin-user-detail' && route.id) {
      app.innerHTML = shell(await renderAdminUserDetailHtml(currentUser, route.id), {
        title: `Admin — Utilisateur — ${PLATFORM_BRAND}`,
        admin: true,
      });
      bindAdminUserDetailPage({
        refreshUser,
        navigate,
        currentUserId: currentUser?.id,
      });
    } else if (route.name === 'admin-crm') {
      app.innerHTML = shell(await renderAdminCrmHtml(currentUser), { title: `Admin — CRM — ${PLATFORM_BRAND}`, admin: true });
      bindAdminCrmPage();
    } else if (route.name === 'admin-attestations') {
      app.innerHTML = shell(await renderAdminAttestationsHtml(currentUser), {
        title: `Admin — Attestations — ${PLATFORM_BRAND}`,
        admin: true,
      });
      bindAdminAttestationsPage();
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

    [document.getElementById('btnLogout'), document.getElementById('btnLogoutDrawer')]
      .filter(Boolean)
      .forEach((btn) => {
        btn.addEventListener('click', async () => {
          closeNavDrawer();
          await signOut();
          currentUser = null;
          navigate('/');
        });
      });
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
        const descText = s.description != null ? String(s.description).trim() : '';
        const descBlock = descText ? `<div class="video-desc">${escapeHtml(descText)}</div>` : '';
        row.innerHTML = `
            <div class="video-date">${s.weekday} ${s.day}</div>
            <div class="video-main">
              <div class="video-title">${escapeHtml(s.title)}</div>
              ${descBlock}
            </div>
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

function formatWebinarDateLong(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function renderHomeWebinarCard(w, variant = 'event') {
  const date = w.startsAt ? formatWebinarDateLong(w.startsAt) : '';
  const tag = w.tag ? `<span class="home-card-tag">${escapeHtml(w.tag)}</span>` : '';
  const meta = variant === 'replay'
    ? `<span class="home-card-meta">Replay disponible</span>`
    : date
      ? `<span class="home-card-meta">${escapeHtml(date)}</span>`
      : '';
  return `
    <a data-router href="/webinars/${escapeHtml(w.id)}" class="home-card">
      <div class="home-card-head">
        ${tag}
        ${meta}
      </div>
      <h3 class="home-card-title">${escapeHtml(w.title || '')}</h3>
      <p class="home-card-desc">${escapeHtml((w.description || '').slice(0, 140))}${(w.description || '').length > 140 ? '…' : ''}</p>
    </a>`;
}

async function renderHome() {
  const nextRes = await fetchNextWebinarEvent().catch(() => null);
  const next = nextRes?.webinar || null;
  const allRes = await fetchWebinars().catch(() => null);
  const all = Array.isArray(allRes?.webinars) ? allRes.webinars : [];
  const replays = all
    .filter((w) => w.lifecycle === 'REPLAY_READY')
    .sort((a, b) => {
      const ra = a.replayViewCount ?? 0;
      const rb = b.replayViewCount ?? 0;
      if (rb !== ra) return rb - ra;
      const da = a.startsAt ? new Date(a.startsAt).getTime() : 0;
      const db = b.startsAt ? new Date(b.startsAt).getTime() : 0;
      return db - da;
    })
    .slice(0, 3);

  const tracks = [
    { key: 'python', index: '01', title: 'Python', copy: 'Écrire ses premiers programmes et apprendre à raisonner comme un développeur.' },
    { key: 'math', index: '02', title: 'Mathématiques', copy: 'Comprendre les outils mathématiques qui donnent du sens aux modèles.' },
    { key: 'ml', index: '03', title: 'Machine Learning', copy: 'Entraîner, évaluer et améliorer ses premiers modèles prédictifs.' },
    { key: 'dl', index: '04', title: 'Intelligence artificielle', copy: 'Explorer les réseaux de neurones et les usages responsables de l’IA.' },
  ].map((track) => ({ ...track, count: sessions.filter((lesson) => lesson.tag === track.key).length }));

  const primaryHref = currentUser ? '/dashboard' : `/course/${COURSE.slug}`;
  const primaryLabel = currentUser ? 'Continuer mon parcours' : 'Découvrir le parcours';
  const workshop = next || replays[0] || null;
  const workshopMeta = workshop?.startsAt
    ? (next ? formatWebinarDateLong(workshop.startsAt) : 'Replay disponible')
    : 'Atelier en ligne';

  const hero = `
    <section class="lms-home-hero">
      <div class="lms-home-hero-copy">
        <p class="lms-kicker">Pour les collégiens et les lycéens</p>
        <h1>Comprendre l’IA.<br><em>Construire avec.</em></h1>
        <p class="lms-home-lead">La Forge Hub transforme les notions complexes en un chemin clair : mathématiques, Python, machine learning, intelligence artificielle et compétences humaines.</p>
        <div class="lms-home-actions">
          <a data-router class="btn btn-primary btn-lg" href="${primaryHref}">${primaryLabel}</a>
          <a data-router class="lms-text-link" href="/webinars">Voir les ateliers <span aria-hidden="true">→</span></a>
        </div>
        <dl class="lms-home-proof" aria-label="Chiffres clés du parcours">
          <div><dt>${sessions.length}</dt><dd>leçons guidées</dd></div>
          <div><dt>5</dt><dd>domaines liés</dd></div>
          <div><dt>À son rythme</dt><dd>progression enregistrée</dd></div>
        </dl>
      </div>
      <div class="lms-home-map" aria-label="Carte du parcours">
        <div class="lms-map-head"><span>Ton chemin d’apprentissage</span><span class="lms-map-status">Progressif</span></div>
        ${tracks.map((track) => `<div class="lms-map-row"><span class="lms-map-index">${track.index}</span><strong>${track.title}</strong><span>${track.count} leçons</span></div>`).join('')}
        <div class="lms-map-soft"><span>+</span><div><strong>Soft skills</strong><small>Communiquer, collaborer, présenter</small></div></div>
      </div>
    </section>`;

  const tracksSection = `
    <section class="lms-section" aria-labelledby="lmsTracksTitle">
      <div class="lms-section-intro">
        <p class="lms-kicker">Les fondamentaux</p>
        <h2 id="lmsTracksTitle">Un seul parcours,<br>des compétences qui se répondent.</h2>
        <p>Chaque domaine renforce les autres. Les mathématiques expliquent, Python permet d’expérimenter et le machine learning donne vie aux données.</p>
      </div>
      <div class="lms-track-grid">
        ${tracks.map((track) => `<a data-router href="/course/${COURSE.slug}" class="lms-track-card lms-track-card--${track.key}">
          <span class="lms-track-num">${track.index}</span>
          <div><h3>${track.title}</h3><p>${track.copy}</p></div>
          <span class="lms-track-count">${track.count} leçons <b aria-hidden="true">↗</b></span>
        </a>`).join('')}
      </div>
    </section>`;

  const methodSection = `
    <section class="lms-method">
      <div class="lms-method-quote"><p>“On apprend vraiment quand on comprend, quand on essaie et quand on sait expliquer.”</p><span>La méthode La Forge</span></div>
      <ol class="lms-method-steps">
        <li><span>01</span><div><strong>Comprendre</strong><p>Une explication guidée, sans jargon inutile.</p></div></li>
        <li><span>02</span><div><strong>Pratiquer</strong><p>Des vidéos, notebooks et exercices concrets.</p></div></li>
        <li><span>03</span><div><strong>Progresser</strong><p>Un espace personnel qui garde le fil.</p></div></li>
      </ol>
    </section>`;

  const replaysSection = replays.length
    ? `<section class="home-section lms-workshops">
        <div class="home-section-head">
          <div><p class="lms-kicker">Savoir faire, savoir être</p><h2 class="h2">Ateliers &amp; compétences humaines</h2></div>
          <a data-router href="/webinars#replays" class="home-section-link">Tous les ateliers →</a>
        </div>
        <div class="home-cards home-cards--3">
          ${replays.map((w) => renderHomeWebinarCard(w, 'replay')).join('')}
        </div>
      </section>`
    : workshop
      ? `<section class="home-section lms-workshops"><div class="home-section-head"><div><p class="lms-kicker">Prochain atelier</p><h2 class="h2">${escapeHtml(workshop.title || '')}</h2><p>${escapeHtml(workshopMeta)}</p></div><a data-router href="/webinars/${escapeHtml(workshop.id)}" class="btn btn-primary">Découvrir</a></div></section>`
      : '';

  const optinSection = `
    <section class="home-optin" id="alertes">
      <div class="home-optin-inner">
        <p class="home-optin-eyebrow">Élèves, parents, enseignants</p>
        <h2 class="h2 home-optin-title">Suivez les prochaines étapes de La Forge.</h2>
        <p class="home-optin-lead">Recevez les nouveaux cours, ateliers et rendez-vous pédagogiques. Seulement l’essentiel.</p>
        <form id="homeOptinForm" class="home-optin-form" novalidate>
          <div class="home-optin-row">
            <input type="text" name="firstName" placeholder="Prénom" autocomplete="given-name" required />
            <input type="text" name="lastName" placeholder="Nom" autocomplete="family-name" required />
          </div>
          <div class="home-optin-row">
            <input type="email" name="email" placeholder="votre@email.com" autocomplete="email" required />
            <button type="submit" class="btn btn-primary">Je m'inscris</button>
          </div>
          <p id="homeOptinMsg" class="home-optin-msg" role="status" aria-live="polite"></p>
        </form>
      </div>
    </section>`;

  return `
    <div class="home-webinars home-lms">
      ${hero}
      ${tracksSection}
      ${methodSection}
      ${replaysSection}
      ${optinSection}
    </div>`;
}

function bindHomeOptinForm() {
  const form = document.getElementById('homeOptinForm');
  if (!form) return;
  const msg = document.getElementById('homeOptinMsg');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (msg) {
      msg.textContent = '';
      msg.classList.remove('is-error', 'is-success');
    }
    const fd = new FormData(form);
    const payload = {
      firstName: String(fd.get('firstName') || '').trim(),
      lastName: String(fd.get('lastName') || '').trim(),
      email: String(fd.get('email') || '').trim(),
    };
    if (!payload.email || !payload.email.includes('@')) {
      if (msg) {
        msg.textContent = 'E-mail invalide.';
        msg.classList.add('is-error');
      }
      return;
    }
    const btn = form.querySelector('button[type="submit"]');
    if (btn) btn.disabled = true;
    try {
      const r = await fetch('/api/newsletter/optin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (msg) {
          msg.textContent = data.error || 'Une erreur est survenue.';
          msg.classList.add('is-error');
        }
        return;
      }
      form.reset();
      if (msg) {
        msg.textContent = 'Inscription confirmée. À très vite !';
        msg.classList.add('is-success');
      }
    } catch (err) {
      if (msg) {
        msg.textContent = 'Connexion impossible. Réessayez.';
        msg.classList.add('is-error');
      }
    } finally {
      if (btn) btn.disabled = false;
    }
  });
}

function renderAuth(mode) {
  const isLogin = mode === 'login';
  const passwordReset = isLogin && new URLSearchParams(window.location.search).get('password-reset') === 'success';
  return `
    <section class="auth-panel">
      <h1 class="h1">${isLogin ? 'Connexion' : 'Créer un compte'}</h1>
      <p class="muted">${isLogin ? 'Accédez à votre progression et à la communauté.' : 'Rejoignez le parcours et suivez vos leçons.'}</p>
      ${passwordReset ? '<p class="auth-success" role="status">Votre mot de passe a été modifié. Vous pouvez maintenant vous connecter.</p>' : ''}
      <form id="authForm" class="form-stack">
        ${isLogin ? '' : `<label>Nom affiché<input type="text" name="displayName" autocomplete="name" required /></label>`}
        <label>E-mail<input type="email" name="email" autocomplete="email" required /></label>
        <label>Mot de passe<input type="password" name="password" autocomplete="${isLogin ? 'current-password' : 'new-password'}" required minlength="6" /></label>
        ${isLogin ? `<p class="auth-help"><a data-router href="/forgot-password">Mot de passe oublié ?</a></p>` : ''}
        <p id="authError" class="form-error" role="alert"></p>
        <button type="submit" class="btn btn-primary btn-block">${isLogin ? 'Se connecter' : "S'inscrire"}</button>
      </form>
      <p class="text-center muted">
        ${isLogin ? `Pas encore de compte ? <a data-router href="/register">S'inscrire</a>` : `Déjà un compte ? <a data-router href="/login">Connexion</a>`}
      </p>
    </section>
  `;
}

function renderForgotPassword() {
  return `
    <section class="auth-panel">
      <h1 class="h1">Mot de passe oublié</h1>
      <p class="muted">Indiquez l’adresse e-mail de votre compte. Nous vous enverrons un lien valable 30 minutes.</p>
      <form id="forgotPasswordForm" class="form-stack">
        <label>E-mail<input type="email" name="email" autocomplete="email" required /></label>
        <p id="authError" class="form-error" role="alert"></p>
        <button type="submit" class="btn btn-primary btn-block">Envoyer le lien</button>
      </form>
      <p class="text-center muted"><a data-router href="/login">Retour à la connexion</a></p>
    </section>`;
}

function bindForgotPasswordForm() {
  const form = document.getElementById('forgotPasswordForm');
  const message = document.getElementById('authError');
  if (!form) return;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    message.textContent = '';
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    const email = String(new FormData(form).get('email') || '').trim();
    try {
      const result = await requestPasswordReset(email);
      message.textContent = result.ok ? result.message : result.error;
      message.classList.toggle('is-success', result.ok);
    } catch {
      message.textContent = 'Connexion impossible. Réessayez.';
      message.classList.remove('is-success');
    } finally {
      button.disabled = false;
    }
  });
}

function renderResetPassword() {
  const token = new URLSearchParams(window.location.search).get('token') || '';
  if (!/^[a-f0-9]{64}$/i.test(token)) {
    return `<section class="auth-panel"><h1 class="h1">Lien invalide</h1><p class="muted">Ce lien de réinitialisation est incomplet ou invalide.</p><a data-router class="btn btn-primary btn-block" href="/forgot-password">Demander un nouveau lien</a></section>`;
  }
  return `
    <section class="auth-panel">
      <h1 class="h1">Nouveau mot de passe</h1>
      <p class="muted">Choisissez un mot de passe d’au moins 8 caractères.</p>
      <form id="resetPasswordForm" class="form-stack">
        <label>Nouveau mot de passe<input type="password" name="password" autocomplete="new-password" required minlength="8" /></label>
        <label>Confirmer le mot de passe<input type="password" name="confirmation" autocomplete="new-password" required minlength="8" /></label>
        <p id="authError" class="form-error" role="alert"></p>
        <button type="submit" class="btn btn-primary btn-block">Changer le mot de passe</button>
      </form>
    </section>`;
}

function bindResetPasswordForm() {
  const form = document.getElementById('resetPasswordForm');
  const message = document.getElementById('authError');
  if (!form) return;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    message.textContent = '';
    const data = new FormData(form);
    const password = String(data.get('password') || '');
    if (password !== String(data.get('confirmation') || '')) {
      message.textContent = 'Les deux mots de passe ne correspondent pas.';
      return;
    }
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const token = new URLSearchParams(window.location.search).get('token') || '';
      const result = await resetPassword(token, password);
      if (!result.ok) {
        message.textContent = result.error;
        return;
      }
      navigate('/login?password-reset=success');
    } catch {
      message.textContent = 'Connexion impossible. Réessayez.';
    } finally {
      button.disabled = false;
    }
  });
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
    'Des vidéos progressives : Python, données, mathématiques et IA',
    'Des notebooks pour essayer, se tromper et recommencer',
    'Une progression enregistrée et une communauté par leçon',
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
          <div class="stat"><div class="stat-num">À son rythme</div><div class="stat-label">progression sauvegardée</div></div>
        </div>
        <div class="filter-bar" id="courseFilterBar">
          <button type="button" class="filter-btn active" data-filter="all">Tout</button>
          <button type="button" class="filter-btn" data-filter="python">Python</button>
          <button type="button" class="filter-btn" data-filter="math">Maths</button>
          <button type="button" class="filter-btn" data-filter="ml">Machine Learning</button>
          <button type="button" class="filter-btn" data-filter="dl">Deep Learning</button>
          <button type="button" class="filter-btn" data-filter="data">Data Analysis</button>
          <button type="button" class="filter-btn" data-filter="framework">Frameworks</button>
          <button type="button" class="filter-btn" data-filter="review">Révisions</button>
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
  const dashboardTracks = [
    { key: 'python', label: 'Python' },
    { key: 'math', label: 'Mathématiques' },
    { key: 'ml', label: 'Machine Learning' },
    { key: 'dl', label: 'Intelligence artificielle' },
    { key: 'data', label: 'Données' },
  ].map((track) => {
    const lessons = sessions.filter((session) => session.tag === track.key);
    const completed = lessons.filter((lesson) => progress[lesson.lessonId]?.completed).length;
    return { ...track, count: lessons.length, completed, percent: lessons.length ? Math.round((completed / lessons.length) * 100) : 0 };
  });
  const resumeHref = lastIncomplete
    ? `/learn/${COURSE.slug}/${encodeURIComponent(lastIncomplete.lessonId)}`
    : sessions[0]
      ? `/learn/${COURSE.slug}/${encodeURIComponent(sessions[0].lessonId)}`
      : `/course/${COURSE.slug}`;

  return `
    <div class="learner-dashboard">
      <header class="learner-dash-head">
        <div><p class="lms-kicker">Mon espace d’apprentissage</p><h1>Bonjour ${escapeHtml(currentUser.displayName || '')}</h1><p>Retrouve ton fil, avance à ton rythme et vois ce que tu sais déjà faire.</p></div>
        <a data-router class="btn btn-secondary" href="/course/${COURSE.slug}">Voir tout le parcours</a>
      </header>
      ${webinarBanner}
      <section class="learner-dash-main">
        <article class="learner-resume-card">
          <div class="learner-resume-top"><span>À continuer</span><span>${pct}% du parcours</span></div>
          <h2>${escapeHtml(lastIncomplete?.title || 'Revoir le parcours depuis le début')}</h2>
          <p>${done} leçons terminées sur ${sessions.length}. Chaque petite étape compte.</p>
          <div class="learner-progress"><span style="width:${pct}%"></span></div>
          <a data-router class="btn btn-primary" href="${resumeHref}">${lastIncomplete ? 'Reprendre cette leçon' : 'Revoir le parcours'}</a>
        </article>
        <aside class="learner-score-card"><div class="dash-ring" style="--p:${pct}"><span>${pct}%</span></div><strong>Progression globale</strong><p>${done} leçons maîtrisées</p></aside>
      </section>
      <section class="learner-domains" aria-labelledby="learnerDomainsTitle">
        <div class="learner-section-head"><div><p class="lms-kicker">Tes domaines</p><h2 id="learnerDomainsTitle">Où en es-tu ?</h2></div><p>Une lecture simple de ta progression, matière par matière.</p></div>
        <div class="learner-domain-grid">
          ${dashboardTracks.map((track) => `<article class="learner-domain-card"><div><span>${track.label}</span><strong>${track.percent}%</strong></div><div class="learner-mini-progress"><span style="width:${track.percent}%"></span></div><p>${track.completed} / ${track.count} leçons</p></article>`).join('')}
        </div>
      </section>
      <details class="learner-profile">
        <summary>Mes informations</summary>
        <form id="profileForm" class="form-inline"><label>Nom affiché<input type="text" name="displayName" value="${escapeHtml(currentUser.displayName || '')}" /></label><button type="submit" class="btn btn-primary">Enregistrer</button><span id="profileMsg" class="muted"></span></form>
      </details>
    </div>
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
        ${lessonDescriptionBlock(lesson)}
        ${lessonCollabBlock(lesson)}
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
        ${lessonDescriptionBlock(lesson)}
        ${lessonCollabBlock(lesson)}
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
      const sid = s.description != null ? String(s.description).trim() : '';
      const desc = sid ? `<span class="ci-desc">${escapeHtml(sid)}</span>` : '';
      return `<a data-router class="curriculum-item ${active ? 'active' : ''} ${done ? 'done' : ''}" href="/learn/${COURSE.slug}/${encodeURIComponent(s.lessonId)}">
        ${mark}<span class="ci-text"><span class="ci-title">${escapeHtml(s.title)}</span>${desc}</span>
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
        ${lessonDescriptionBlock(lesson)}
        <div class="video-wrap">
          <iframe id="ytFrame" class="video-iframe" src="https://www.youtube.com/embed/${lesson.youtubeId}?enablejsapi=1" title="${escapeHtml(lesson.title)}"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
        </div>
        ${lessonCollabBlock(lesson)}
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
