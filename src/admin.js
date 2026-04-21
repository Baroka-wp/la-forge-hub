import {
  backendMode,
  fetchAdminOverview,
  fetchAdminUsersList,
  fetchAdminUserDetail,
  fetchLessonsForAdmin,
  adminPatchLesson,
  adminCreateLesson,
  adminDeleteLesson,
  adminPatchUser,
  fetchAdminCrmContacts,
  adminCreateCrmContact,
  adminCrmSendBulkEmail,
} from './api.js';
import { COURSE, PLATFORM_BRAND } from './seed-data.js';

function esc(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Initiale affichée dans l’avatar (premier caractère du nom ou de l’e-mail). */
function userInitialLetter(u) {
  if (!u) return '?';
  const s = String(u.displayName || u.email || '?').trim();
  const ch = s.codePointAt(0);
  if (ch === undefined) return '?';
  return String.fromCodePoint(ch).toUpperCase();
}

function userFullName(u) {
  if (!u) return '';
  return String(u.displayName || u.email || '').trim();
}

const ADMIN_LESSONS_PAGE_SIZE = 12;

function adminNav(active, user) {
  const initial = esc(userInitialLetter(user));
  const name = esc(userFullName(user));
  const userBlock =
    user !== undefined && user !== null
      ? `<div class="admin-sidebar-user">
      <div class="admin-user-avatar" aria-hidden="true">${initial}</div>
      <p class="admin-user-name">${name}</p>
    </div>`
      : '';
  return `
  <aside class="admin-sidebar surface-container-low">
    <div class="admin-sidebar-main">
      <div class="admin-sidebar-head">
        <span class="admin-sidebar-kicker">${esc(PLATFORM_BRAND)}</span>
        <p class="admin-sidebar-title">Administration</p>
      </div>
      <nav class="admin-nav" aria-label="Navigation administration">
        <a data-router href="/admin" class="admin-nav-link ${active === 'overview' ? 'is-active' : ''}">Vue d’ensemble</a>
        <a data-router href="/admin/lessons" class="admin-nav-link ${active === 'lessons' ? 'is-active' : ''}">Leçons</a>
        <a data-router href="/admin/webinars" class="admin-nav-link ${active === 'webinars' ? 'is-active' : ''}">Webinaires</a>
        <a data-router href="/admin/users" class="admin-nav-link ${active === 'users' ? 'is-active' : ''}">Utilisateurs</a>
        <a data-router href="/admin/crm" class="admin-nav-link ${active === 'crm' ? 'is-active' : ''}">Contacts (CRM)</a>
      </nav>
      <a data-router href="/" class="admin-back-link">← Retour au site</a>
    </div>
    ${userBlock}
  </aside>`;
}

export function wrapAdminPage(active, innerHtml, user) {
  return `
  <div class="admin-dashboard">
    ${adminNav(active, user)}
    <div class="admin-content">${innerHtml}</div>
  </div>`;
}

export async function renderAdminOverviewHtml(user) {
  const neon = backendMode() === 'neon';
  const ov = neon ? await fetchAdminOverview() : { ok: false };
  const stats =
    ov.ok && 'userCount' in ov
      ? `<div class="admin-stats">
        <article class="admin-stat-card surface-container-lowest">
          <span class="admin-stat-num">${ov.userCount}</span>
          <span class="admin-stat-label">Utilisateurs</span>
        </article>
        <article class="admin-stat-card surface-container-lowest">
          <span class="admin-stat-num">${ov.lessonCount}</span>
          <span class="admin-stat-label">Leçons en base</span>
        </article>
        <article class="admin-stat-card surface-container-lowest">
          <span class="admin-stat-num">${ov.adminCount}</span>
          <span class="admin-stat-label">Administrateurs</span>
        </article>
      </div>`
      : `<p class="admin-banner muted">Les statistiques nécessitent le mode API Neon et une base connectée.</p>`;

  const inner = `
    <header class="admin-page-head">
      <h1 class="h1">Vue d’ensemble</h1>
      <p class="muted body-lg">Tableau de bord — parcours <strong>${esc(COURSE.slug)}</strong>.</p>
    </header>
    ${stats}
    <section class="admin-quick surface-container-low">
      <h2 class="h3 admin-quick-title">Raccourcis</h2>
      <div class="admin-quick-grid">
        <a data-router href="/admin/lessons" class="admin-quick-tile surface-container-lowest">
          <span class="admin-quick-tile-title">Leçons</span>
          <span class="muted small">Vidéos, tags, notebooks Colab</span>
        </a>
        <a data-router href="/admin/webinars" class="admin-quick-tile surface-container-lowest">
          <span class="admin-quick-tile-title">Webinaires</span>
          <span class="muted small">Replays, événements, inscriptions</span>
        </a>
        <a data-router href="/admin/users" class="admin-quick-tile surface-container-lowest">
          <span class="admin-quick-tile-title">Utilisateurs</span>
          <span class="muted small">Rôles learner / admin</span>
        </a>
        <a data-router href="/admin/crm" class="admin-quick-tile surface-container-lowest">
          <span class="admin-quick-tile-title">Contacts (CRM)</span>
          <span class="muted small">E-mails inscriptions & annonces</span>
        </a>
      </div>
    </section>`;
  return wrapAdminPage('overview', inner, user);
}

export async function renderAdminLessonsHtml(user) {
  const neon = backendMode() === 'neon';
  const fetched = neon ? await fetchLessonsForAdmin() : { ok: false, lessons: [] };
  const lessons = fetched.ok ? fetched.lessons : [];
  const seededCatalog =
    lessons.length > 0 && String(lessons[0].lessonId || '').startsWith(`${COURSE.slug}-`);

  const rows = lessons
    .map((L) => {
      const id = esc(L.lessonId);
      const titleLc = esc(String(L.title || '').toLowerCase());
      const tagLc = esc(String(L.tag || '').toLowerCase());
      return `
      <tr data-lesson-id="${id}" data-search="${titleLc} ${tagLc} ${id.toLowerCase()}" data-tag="${tagLc}">
        <td><code class="admin-code">${id}</code></td>
        <td><input type="text" class="admin-field" data-field="title" value="${esc(L.title)}" /></td>
        <td><textarea class="admin-field admin-field--lesson-desc" data-field="description" rows="2" placeholder="Résumé (menu & catalogue)">${esc(L.description || '')}</textarea></td>
        <td><input type="text" class="admin-field" data-field="youtubeId" value="${esc(L.youtubeId)}" spellcheck="false" /></td>
        <td><input type="text" class="admin-field admin-field--narrow" data-field="tag" value="${esc(L.tag)}" /></td>
        <td><input type="number" class="admin-field admin-field--narrow" data-field="position" value="${L.position}" min="1" /></td>
        <td><input type="url" class="admin-field" data-field="collabUrl" value="${esc(L.collabUrl || '')}" placeholder="https://colab…" /></td>
        <td class="admin-actions">
          <button type="button" class="admin-icon-btn admin-icon-btn--save" data-save-lesson="${id}" aria-label="Enregistrer cette leçon" title="Enregistrer">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
          </button>
          <button type="button" class="admin-icon-btn admin-icon-btn--danger" data-delete-lesson="${id}" aria-label="Supprimer cette leçon" title="Supprimer">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </td>
      </tr>`;
    })
    .join('');
  const totalLessons = lessons.length;
  const totalPages = Math.max(1, Math.ceil(totalLessons / ADMIN_LESSONS_PAGE_SIZE) || 1);
  const from = totalLessons === 0 ? 0 : 1;
  const to = Math.min(totalLessons, ADMIN_LESSONS_PAGE_SIZE);
  const pagerMeta = `${totalLessons} leçon(s) · lignes ${from}-${to} · page 1 / ${totalPages}`;
  const prevDisabled = 'disabled';
  const nextDisabled = totalPages <= 1 ? 'disabled' : '';
  const lessonsWithDescription = lessons.filter((l) => String(l.description || '').trim()).length;
  const lessonsWithNotebook = lessons.filter((l) => String(l.collabUrl || '').trim()).length;
  const uniqueTags = new Set(lessons.map((l) => String(l.tag || '').trim().toLowerCase()).filter(Boolean)).size;
  const tagOptions = Array.from(
    new Set(lessons.map((l) => String(l.tag || '').trim()).filter(Boolean)),
  )
    .sort((a, b) => a.localeCompare(b, 'fr'))
    .map((tag) => `<option value="${esc(tag)}">${esc(tag)}</option>`)
    .join('');

  const drawer = `
    <div id="adminLessonDrawerOverlay" class="admin-drawer-overlay" hidden></div>
    <aside id="adminLessonDrawer" class="admin-drawer" aria-hidden="true">
      <div class="admin-drawer-head">
        <h2 class="h3">Ajouter une leçon</h2>
        <button type="button" class="admin-drawer-close" id="adminLessonDrawerClose" aria-label="Fermer">×</button>
      </div>
      <form id="adminNewLessonForm" class="admin-form-grid">
        <label>Titre<input type="text" name="title" required placeholder="Titre de la session" /></label>
        <label>ID YouTube (vidéo)<input type="text" name="youtubeId" required placeholder="ex. dQw4w9WgXcQ" /></label>
        <label>Tag module<input type="text" name="tag" value="ml" /></label>
        <label>ID leçon (optionnel)<input type="text" name="lessonId" placeholder="${esc(COURSE.slug)}-0123 — laisser vide pour auto" /></label>
        <label class="admin-form-span2">Lien Colab / corrigé<input type="url" name="collabUrl" placeholder="https://colab.research.google.com/..." /></label>
        <label class="admin-form-span2">Description courte (optionnel)<textarea name="description" rows="3" placeholder="Affichée dans le menu des leçons et le catalogue"></textarea></label>
        <div class="admin-form-actions">
          <button type="submit" class="btn btn-primary">Créer la leçon</button>
          <button type="button" class="btn btn-secondary" id="adminLessonDrawerCancel">Annuler</button>
        </div>
      </form>
    </aside>`;

  const inner = `
    <header class="admin-page-head">
      <div class="admin-page-head-row">
        <div>
          <h1 class="h1">Leçons</h1>
          <p class="muted body-lg">Modifier le catalogue vidéo et les ressources associées.</p>
        </div>
        ${neon ? '<button type="button" id="adminLessonNewBtn" class="btn btn-primary">+ Nouvelle leçon</button>' : ''}
      </div>
    </header>
    ${
      neon
        ? `<section class="admin-kpi-row" id="adminLessonsKpi">
      <article class="admin-kpi-card surface-container-low"><span class="muted small">Leçons</span><strong id="adminLessonsKpiTotal">${totalLessons}</strong></article>
      <article class="admin-kpi-card surface-container-low"><span class="muted small">Avec description</span><strong id="adminLessonsKpiDesc">${lessonsWithDescription}</strong></article>
      <article class="admin-kpi-card surface-container-low"><span class="muted small">Avec notebook</span><strong id="adminLessonsKpiNotebook">${lessonsWithNotebook}</strong></article>
      <article class="admin-kpi-card surface-container-low"><span class="muted small">Tags actifs</span><strong id="adminLessonsKpiTags">${uniqueTags}</strong></article>
    </section>`
        : ''
    }
    ${
      neon && !seededCatalog && lessons.length === 0
        ? `<p class="form-error admin-msg">Aucune leçon en base. Importez le catalogue avec <code>npm run db:seed</code> ou créez une première leçon ci-dessous.</p>`
        : ''
    }
    ${
      neon && !seededCatalog && lessons.length > 0
        ? `<p class="form-error admin-msg">Les identifiants ne suivent pas le format <code>${esc(COURSE.slug)}-XXXX</code> — le catalogue peut venir du fichier. Enregistrez en base avec le seed pour une gestion complète.</p>`
        : ''
    }
    ${neon ? '' : `<p class="muted">Mode local : le catalogue est lu depuis le fichier, pas d’édition API.</p>`}
    <p id="adminLessonsMsg" class="admin-msg form-error" role="status"></p>
    <div class="admin-toolbar">
      <label>
        <span class="admin-label-text">Recherche</span>
        <input id="adminLessonsSearch" type="search" placeholder="ID, titre ou tag" />
      </label>
      <label>
        <span class="admin-label-text">Tag</span>
        <select id="adminLessonsTagFilter">
          <option value="">Tous</option>
          ${tagOptions}
        </select>
      </label>
    </div>
    <div class="admin-table-wrap">
      <table class="admin-table admin-table--lessons">
        <thead>
          <tr>
            <th>ID</th>
            <th>Titre</th>
            <th>Description</th>
            <th>YouTube ID</th>
            <th>Tag</th>
            <th>Pos.</th>
            <th>Notebook</th>
            <th></th>
          </tr>
        </thead>
        <tbody id="adminLessonsTbody">${rows || `<tr><td colspan="8" class="muted">Aucune leçon.</td></tr>`}</tbody>
      </table>
    </div>
    <nav class="admin-webinars-pager" aria-label="Pagination des leçons">
      <p class="admin-webinars-pager-meta" id="adminLessonsPagerMeta">${esc(pagerMeta)}</p>
      <div class="admin-webinars-pager-btns">
        <button type="button" class="btn btn-secondary btn-sm" id="adminLessonsPagerPrev" ${prevDisabled}>Précédent</button>
        <button type="button" class="btn btn-secondary btn-sm" id="adminLessonsPagerNext" ${nextDisabled}>Suivant</button>
      </div>
    </nav>
    ${neon ? drawer : ''}`;

  return wrapAdminPage('lessons', inner, user);
}

export async function renderAdminUsersHtml(user) {
  const neon = backendMode() === 'neon';
  const list = neon
    ? await fetchAdminUsersList({ page: 1, pageSize: 25 })
    : { ok: false, users: [], total: 0, page: 1, pageSize: 25, totalPages: 1, totals: null };
  const users = list.ok ? list.users : [];
  const totals = list.totals || { total: users.length, admins: 0, learners: 0, newLast30Days: 0 };
  const pagerMeta = `Page ${list.page ?? 1} / ${list.totalPages ?? 1} · ${list.total ?? users.length} utilisateur(s)`;

  const rows = users
    .map((u) => {
      const id = esc(u.id);
      const displayName = esc(u.displayName || 'Sans nom');
      const email = esc(u.email);
      const isAdmin = u.role === 'admin';
      return `
      <tr data-user-id="${id}">
        <td>
          <a data-router href="/admin/users/${id}" class="admin-user-link">
            <span class="admin-user-link-name">${displayName}</span>
            <span class="admin-user-link-email muted">${email}</span>
          </a>
        </td>
        <td>
          <div class="admin-role-toggle" data-user-role-toggle="${id}">
            <button type="button" class="admin-role-toggle-btn ${isAdmin ? '' : 'is-active'}" data-set-role="${id}:learner">Learner</button>
            <button type="button" class="admin-role-toggle-btn ${isAdmin ? 'is-active' : ''}" data-set-role="${id}:admin">Admin</button>
          </div>
        </td>
        <td class="muted">${u.enrollments}</td>
        <td class="muted">${u.progressRows}</td>
        <td><time datetime="${esc(u.createdAt)}">${new Date(u.createdAt).toLocaleDateString('fr-FR')}</time></td>
        <td><a data-router href="/admin/users/${id}" class="btn btn-secondary btn-sm">Fiche</a></td>
      </tr>`;
    })
    .join('');

  const inner = `
    <header class="admin-page-head">
      <h1 class="h1">Utilisateurs</h1>
      <p class="muted body-lg">Rôles, activité et suivi des comptes.</p>
    </header>
    ${neon
      ? `<section class="admin-kpi-row">
      <article class="admin-kpi-card surface-container-low"><span class="muted small">Total</span><strong>${totals.total ?? 0}</strong></article>
      <article class="admin-kpi-card surface-container-low"><span class="muted small">Admins</span><strong>${totals.admins ?? 0}</strong></article>
      <article class="admin-kpi-card surface-container-low"><span class="muted small">Learners</span><strong>${totals.learners ?? 0}</strong></article>
      <article class="admin-kpi-card surface-container-low"><span class="muted small">Nouveaux 30j</span><strong>${totals.newLast30Days ?? 0}</strong></article>
    </section>`
      : ''}
    ${
      !neon
        ? `<p class="muted">Mode local : pas de liste centralisée.</p>`
        : ''
    }
    <p id="adminUsersMsg" class="admin-msg form-error" role="status"></p>
    <div class="admin-toolbar">
      <label>
        <span class="admin-label-text">Recherche</span>
        <input id="adminUsersSearch" type="search" placeholder="Nom ou e-mail" />
      </label>
      <label>
        <span class="admin-label-text">Rôle</span>
        <select id="adminUsersRoleFilter">
          <option value="">Tous</option>
          <option value="admin">Admin</option>
          <option value="learner">Learner</option>
        </select>
      </label>
    </div>
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead>
          <tr>
            <th>Utilisateur</th>
            <th>Rôle</th>
            <th>Inscriptions</th>
            <th>Progression</th>
            <th>Inscription</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody id="adminUsersTbody">${rows || `<tr><td colspan="6" class="muted">Aucun utilisateur.</td></tr>`}</tbody>
      </table>
    </div>
    <nav class="admin-webinars-pager" aria-label="Pagination des utilisateurs">
      <p class="admin-webinars-pager-meta" id="adminUsersPagerMeta">${esc(pagerMeta)}</p>
      <div class="admin-webinars-pager-btns">
        <button type="button" class="btn btn-secondary btn-sm" id="adminUsersPagerPrev" ${(list.page ?? 1) <= 1 ? 'disabled' : ''}>Précédent</button>
        <button type="button" class="btn btn-secondary btn-sm" id="adminUsersPagerNext" ${(list.page ?? 1) >= (list.totalPages ?? 1) ? 'disabled' : ''}>Suivant</button>
      </div>
    </nav>
    <p class="muted small admin-footnote">Le dernier administrateur ne peut pas être rétrogradé (protection serveur).</p>`;

  return wrapAdminPage('users', inner, user);
}

export async function renderAdminUserDetailHtml(currentUser, userId) {
  const neon = backendMode() === 'neon';
  if (!neon) {
    return wrapAdminPage('users', `<p class="muted">Mode local.</p>`, currentUser);
  }
  const detail = await fetchAdminUserDetail(userId);
  if (!detail.ok || !detail.user) {
    return wrapAdminPage(
      'users',
      `<p class="form-error">${esc(detail.error || 'Utilisateur introuvable')}</p><p><a data-router href="/admin/users">← Retour</a></p>`,
      currentUser,
    );
  }
  const u = detail.user;
  const progress = detail.progress || { total: 0, completed: 0, completionRate: 0, rows: [] };
  const enrollments = detail.enrollments || [];
  const webinars = detail.webinars || [];
  const crm = detail.crm;

  const enrollRows = enrollments.length
    ? enrollments
      .map(
        (e) => `<tr>
      <td><code class="admin-code">${esc(e.courseSlug)}</code></td>
      <td><time datetime="${esc(e.enrolledAt)}">${new Date(e.enrolledAt).toLocaleString('fr-FR')}</time></td>
    </tr>`,
      )
      .join('')
    : '<tr><td colspan="2" class="muted">Aucune inscription formation.</td></tr>';

  const webinarRows = webinars.length
    ? webinars
      .map(
        (r) => `<tr>
      <td>${esc(r.webinarTitle || '—')}</td>
      <td class="muted">${esc(r.webinarKind || '—')}</td>
      <td>${r.marketingOptIn ? 'Oui' : '<span class="muted">Non</span>'}</td>
      <td><time datetime="${esc(r.registeredAt)}">${new Date(r.registeredAt).toLocaleString('fr-FR')}</time></td>
    </tr>`,
      )
      .join('')
    : '<tr><td colspan="4" class="muted">Aucune inscription webinaire.</td></tr>';

  const isAdmin = u.role === 'admin';

  const inner = `
    <header class="admin-page-head">
      <p class="muted"><a data-router href="/admin/users">← Retour à la liste</a></p>
      <h1 class="h1">${esc(u.displayName || u.email)}</h1>
      <p class="muted">${esc(u.email)}</p>
    </header>
    <section class="admin-user-detail">
      <article class="surface-container-low admin-user-detail-card">
        <h2 class="h3">Identité</h2>
        <p><strong>Rôle :</strong> ${esc(u.role)}</p>
        <p><strong>Créé le :</strong> <time datetime="${esc(u.createdAt)}">${new Date(u.createdAt).toLocaleString('fr-FR')}</time></p>
        <div class="admin-role-toggle" data-user-role-toggle="${esc(u.id)}">
          <button type="button" class="admin-role-toggle-btn ${isAdmin ? '' : 'is-active'}" data-set-role="${esc(u.id)}:learner">Learner</button>
          <button type="button" class="admin-role-toggle-btn ${isAdmin ? 'is-active' : ''}" data-set-role="${esc(u.id)}:admin">Admin</button>
        </div>
      </article>
      <article class="surface-container-low admin-user-detail-card">
        <h2 class="h3">Formation</h2>
        <p class="muted">Progression : <strong>${progress.completed}/${progress.total}</strong> (${progress.completionRate}%)</p>
        <div class="admin-table-wrap">
          <table class="admin-table">
            <thead><tr><th>Parcours</th><th>Inscription</th></tr></thead>
            <tbody>${enrollRows}</tbody>
          </table>
        </div>
      </article>
      <article class="surface-container-low admin-user-detail-card admin-user-detail-card--wide">
        <h2 class="h3">Webinaires</h2>
        <div class="admin-table-wrap">
          <table class="admin-table">
            <thead><tr><th>Webinaire</th><th>Type</th><th>Opt-in</th><th>Date</th></tr></thead>
            <tbody>${webinarRows}</tbody>
          </table>
        </div>
      </article>
      <article class="surface-container-low admin-user-detail-card admin-user-detail-card--wide">
        <h2 class="h3">CRM</h2>
        ${
          crm
            ? `<p><strong>Nom :</strong> ${esc(crm.displayName || '—')}</p>
          <p><strong>Téléphone :</strong> ${esc(crm.phone || '—')}</p>
          <p><strong>Annonces :</strong> ${crm.marketingOptIn ? 'Oui' : 'Non'}</p>
          <p><a data-router href="/admin/crm">Ouvrir le CRM</a></p>`
            : '<p class="muted">Aucune fiche CRM liée à cet e-mail.</p>'
        }
      </article>
    </section>
    <p id="adminUserDetailMsg" class="admin-msg form-error" role="status"></p>`;
  return wrapAdminPage('users', inner, currentUser);
}

export async function renderAdminCrmHtml(user) {
  const neon = backendMode() === 'neon';
  const data = neon
    ? await fetchAdminCrmContacts({ page: 1, pageSize: 25 })
    : { ok: false, contacts: [], total: 0, page: 1, pageSize: 25, totalPages: 1, totals: null };
  const contacts = data.ok ? data.contacts : [];
  const totals = data.totals || { total: contacts.length, optIn: 0, withPhone: 0 };
  const noPhone = Math.max(0, (totals.total ?? 0) - (totals.withPhone ?? 0));

  const rows = contacts
    .map((c) => {
      const id = esc(c.id);
      return `
      <tr data-contact-id="${id}">
        <td class="admin-table-cb"><input type="checkbox" class="admin-crm-row-cb" data-contact-id="${id}" aria-label="Sélectionner ${esc(c.email)}" /></td>
        <td><code class="admin-code">${esc(c.email)}</code></td>
        <td>${esc(c.displayName || '—')}</td>
        <td class="muted">${esc(c.phone || '—')}</td>
        <td>${c.marketingOptIn ? '<span class="admin-badge admin-badge--ok">Oui</span>' : '<span class="muted">Non</span>'}</td>
        <td class="muted">${c.webinarRegistrationCount ?? 0}</td>
        <td>${c.hasFormationEnrollment ? 'Oui' : '<span class="muted">Non</span>'}</td>
        <td class="muted"><time datetime="${esc(c.updatedAt)}">${new Date(c.updatedAt).toLocaleString('fr-FR')}</time></td>
      </tr>`;
    })
    .join('');

  const inner = `
    <div class="admin-crm-page">
    <header class="admin-page-head admin-crm-page-head">
      <div class="admin-page-head-row">
        <div>
          <h1 class="h1">Contacts (CRM)</h1>
          <p class="muted body-lg">Base contacts pour annonces webinaires et formation.</p>
        </div>
        ${neon ? '<button type="button" id="adminCrmAddOpen" class="btn btn-primary">+ Nouveau contact</button>' : ''}
      </div>
    </header>
    ${
      neon
        ? `<section class="admin-kpi-row">
      <article class="admin-kpi-card surface-container-low"><span class="muted small">Total contacts</span><strong>${totals.total ?? 0}</strong></article>
      <article class="admin-kpi-card surface-container-low"><span class="muted small">Opt-in annonces</span><strong>${totals.optIn ?? 0}</strong></article>
      <article class="admin-kpi-card surface-container-low"><span class="muted small">Avec téléphone</span><strong>${totals.withPhone ?? 0}</strong></article>
      <article class="admin-kpi-card surface-container-low"><span class="muted small">Sans téléphone</span><strong>${noPhone}</strong></article>
    </section>`
        : ''
    }
    ${
      !neon
        ? `<p class="muted">Mode local : pas de CRM.</p>`
        : ''
    }
    ${
      neon
        ? `<section class="admin-crm-toolbar surface-container-low" aria-label="Outils liste contacts">
      <div class="admin-toolbar">
        <label>Recherche
          <input type="search" id="adminCrmSearch" placeholder="E-mail ou nom" autocomplete="off" />
        </label>
        <label>Filtre annonces
          <select id="adminCrmOptFilter">
            <option value="">Tous</option>
            <option value="true">Opt-in uniquement</option>
            <option value="false">Non opt-in</option>
          </select>
        </div>
      <div class="admin-crm-toolbar-end">
        <span id="adminCrmSelectionHint" class="admin-crm-selection-hint muted small" aria-live="polite">Aucune sélection</span>
        <div class="admin-crm-toolbar-actions">
          <button type="button" class="btn btn-primary btn-sm" id="adminCrmSendSelected">Envoyer à la sélection</button>
          <button type="button" class="btn btn-secondary btn-sm" id="adminCrmSendAll" title="Tous les contacts correspondant à la recherche et au filtre">Envoyer à tous</button>
        </div>
      </div>
      <p id="adminCrmMsg" class="admin-msg form-error admin-crm-toolbar-msg" role="status"></p>
    </section>`
        : ''
    }
    <div class="admin-table-wrap admin-crm-table-wrap" id="adminCrmTableWrap">
      <table class="admin-table admin-table--crm">
        <thead>
          <tr>
            <th scope="col" class="admin-table-cb"><input type="checkbox" id="adminCrmSelectPage" title="Tout sélectionner sur cette page" aria-label="Tout sélectionner sur cette page" /></th>
            <th>E-mail</th>
            <th>Nom</th>
            <th>Tél.</th>
            <th>Annonces</th>
            <th>Web.</th>
            <th>Formation</th>
            <th>Mis à jour</th>
          </tr>
        </thead>
        <tbody id="adminCrmTbody">${rows || `<tr><td colspan="8" class="muted">Aucun contact.</td></tr>`}</tbody>
      </table>
    </div>
    ${
      neon
        ? `<nav class="admin-webinars-pager" aria-label="Pagination des contacts CRM">
      <p class="admin-webinars-pager-meta" id="adminCrmPagerMeta">Page ${data.page ?? 1} / ${data.totalPages ?? 1} · ${data.total ?? 0} contact(s)</p>
      <div class="admin-webinars-pager-btns">
        <button type="button" class="btn btn-secondary btn-sm" id="adminCrmPagerPrev" ${(data.page ?? 1) <= 1 ? 'disabled' : ''}>Précédent</button>
        <button type="button" class="btn btn-secondary btn-sm" id="adminCrmPagerNext" ${(data.page ?? 1) >= (data.totalPages ?? 1) ? 'disabled' : ''}>Suivant</button>
      </div>
    </nav>`
        : ''
    }
    ${
      neon
        ? `<div id="adminCrmDrawerOverlay" class="admin-drawer-overlay" hidden></div>
    <aside id="adminCrmDrawer" class="admin-drawer" aria-hidden="true">
      <div class="admin-drawer-head">
        <h2 class="h3">Ajouter un contact</h2>
        <button type="button" class="admin-drawer-close" id="adminCrmDrawerClose" aria-label="Fermer">×</button>
      </div>
      <form id="adminCrmAddForm" class="admin-form-grid admin-form-grid--crm-add">
        <label>E-mail <input type="email" name="email" required autocomplete="email" placeholder="contact@exemple.com" class="admin-field" /></label>
        <label>Nom <input type="text" name="displayName" autocomplete="name" placeholder="Prénom Nom" class="admin-field" /></label>
        <label>Téléphone <input type="tel" name="phone" autocomplete="tel" placeholder="+229 …" class="admin-field" /></label>
        <label class="admin-form-span3 admin-crm-opt-in-label"><input type="checkbox" name="marketingOptIn" /> Accepte les e-mails d’annonces La Forge Hub</label>
        <div class="admin-form-actions admin-form-span3">
          <button type="submit" class="btn btn-primary">Enregistrer</button>
          <button type="button" class="btn btn-secondary" id="adminCrmDrawerCancel">Annuler</button>
        </div>
      </form>
      <p id="adminCrmAddMsg" class="admin-msg" role="status"></p>
    </aside>
    <div class="admin-crm-panels">
    <section class="admin-crm-compose surface-container-low">
      <h2 class="h3">E-mail groupé (HTML)</h2>
      <p class="muted small">Corps en HTML simple (<code>&lt;p&gt;</code>, <code>&lt;strong&gt;</code>, <code>&lt;a href&gt;</code>, <code>&lt;br&gt;</code>). Les envois se lancent depuis la barre d’outils ci-dessus.</p>
      <div class="admin-crm-mail-fields">
        <label class="admin-crm-mail-subj">Objet <input type="text" id="adminCrmMailSubject" class="admin-field" placeholder="Objet du message" /></label>
        <label class="admin-crm-mail-body">Message HTML
          <textarea id="adminCrmMailBody" class="admin-field admin-crm-body" rows="14" placeholder="&lt;p&gt;Bonjour,&lt;/p&gt;&#10;&lt;p&gt;…&lt;/p&gt;"></textarea>
        </label>
        <label class="admin-crm-only-opt"><input type="checkbox" id="adminCrmOnlyOptIn" checked /> Cible&nbsp;: uniquement les contacts avec « annonces&nbsp;: oui »</label>
      </div>
      <p id="adminCrmSendMsg" class="admin-msg" role="status"></p>
    </section>
    </div>`
        : ''
    }
    </div>`;

  return wrapAdminPage('crm', inner, user);
}

export function bindAdminCrmPage() {
  if (backendMode() !== 'neon') return;
  const tbody = document.getElementById('adminCrmTbody');
  const pager = document.getElementById('adminCrmPagerMeta');
  const prevBtn = document.getElementById('adminCrmPagerPrev');
  const nextBtn = document.getElementById('adminCrmPagerNext');
  const search = document.getElementById('adminCrmSearch');
  const optFilter = document.getElementById('adminCrmOptFilter');
  const msg = document.getElementById('adminCrmMsg');
  const selectPage = document.getElementById('adminCrmSelectPage');
  const selectionHint = document.getElementById('adminCrmSelectionHint');
  const addForm = document.getElementById('adminCrmAddForm');
  const addMsg = document.getElementById('adminCrmAddMsg');
  const openDrawerBtn = document.getElementById('adminCrmAddOpen');
  const drawer = document.getElementById('adminCrmDrawer');
  const drawerOverlay = document.getElementById('adminCrmDrawerOverlay');
  const closeDrawerBtn = document.getElementById('adminCrmDrawerClose');
  const cancelDrawerBtn = document.getElementById('adminCrmDrawerCancel');
  const sendMsg = document.getElementById('adminCrmSendMsg');
  const btnSendSel = document.getElementById('adminCrmSendSelected');
  const btnSendAll = document.getElementById('adminCrmSendAll');
  let page = 1;
  let q = '';
  let marketingOptIn = '';

  function escCell(s) {
    return esc(String(s ?? ''));
  }

  function selectedIds() {
    return Array.from(document.querySelectorAll('.admin-crm-row-cb:checked'))
      .map((el) => el.getAttribute('data-contact-id'))
      .filter(Boolean);
  }

  function updateSelectionHint() {
    if (!selectionHint) return;
    const n = document.querySelectorAll('.admin-crm-row-cb:checked').length;
    if (n === 0) selectionHint.textContent = 'Aucune sélection';
    else if (n === 1) selectionHint.textContent = '1 contact sélectionné';
    else selectionHint.textContent = `${n} contacts sélectionnés`;
  }

  function closeDrawer() {
    if (!drawer || !drawerOverlay) return;
    drawer.classList.remove('admin-drawer--open');
    drawer.setAttribute('aria-hidden', 'true');
    drawerOverlay.hidden = true;
  }

  function openDrawer() {
    if (!drawer || !drawerOverlay) return;
    drawer.classList.add('admin-drawer--open');
    drawer.setAttribute('aria-hidden', 'false');
    drawerOverlay.hidden = false;
  }

  openDrawerBtn?.addEventListener('click', openDrawer);
  closeDrawerBtn?.addEventListener('click', closeDrawer);
  cancelDrawerBtn?.addEventListener('click', closeDrawer);
  drawerOverlay?.addEventListener('click', closeDrawer);

  async function load() {
    if (!tbody) return;
    if (prevBtn) prevBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;
    const r = await fetchAdminCrmContacts({ page, pageSize: 25, q, marketingOptIn: marketingOptIn || undefined });
    if (!r.ok) {
      if (msg) msg.textContent = r.error || 'Erreur';
      return;
    }
    if (msg) msg.textContent = '';
    tbody.innerHTML = (r.contacts || [])
      .map((c) => {
        const id = escCell(c.id);
        const ann = c.marketingOptIn
          ? '<span class="admin-badge admin-badge--ok">Oui</span>'
          : '<span class="muted">Non</span>';
        const form = c.hasFormationEnrollment ? 'Oui' : '<span class="muted">Non</span>';
        return `<tr data-contact-id="${id}">
        <td class="admin-table-cb"><input type="checkbox" class="admin-crm-row-cb" data-contact-id="${id}" aria-label="Sélectionner ${escCell(c.email)}" /></td>
        <td><code class="admin-code">${escCell(c.email)}</code></td>
        <td>${escCell(c.displayName || '—')}</td>
        <td class="muted">${escCell(c.phone || '—')}</td>
        <td>${ann}</td>
        <td class="muted">${c.webinarRegistrationCount ?? 0}</td>
        <td>${form}</td>
        <td class="muted"><time datetime="${escCell(c.updatedAt)}">${new Date(c.updatedAt).toLocaleString('fr-FR')}</time></td>
      </tr>`;
      })
      .join('');
    if (!r.contacts || r.contacts.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="muted">Aucun contact.</td></tr>';
    }
    if (selectPage) selectPage.checked = false;
    updateSelectionHint();
    if (pager) {
      pager.innerHTML = `Page ${r.page} / ${r.totalPages} · ${r.total} contact(s)`;
    }
    page = r.page ?? page;
    if (prevBtn) prevBtn.disabled = (r.page ?? 1) <= 1;
    if (nextBtn) nextBtn.disabled = (r.page ?? 1) >= (r.totalPages ?? 1);
  }

  selectPage?.addEventListener('change', () => {
    const on = selectPage.checked;
    document.querySelectorAll('.admin-crm-row-cb').forEach((cb) => {
      cb.checked = on;
    });
    updateSelectionHint();
  });

  tbody?.addEventListener('change', (e) => {
    const t = e.target;
    if (!(t instanceof HTMLInputElement) || !t.classList.contains('admin-crm-row-cb')) return;
    if (!selectPage) return;
    const boxes = document.querySelectorAll('.admin-crm-row-cb');
    if (!boxes.length) {
      selectPage.checked = false;
      updateSelectionHint();
      return;
    }
    selectPage.checked = Array.from(boxes).every((x) => x.checked);
    updateSelectionHint();
  });

  addForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (addMsg) addMsg.textContent = '';
    const fd = new FormData(addForm);
    const email = String(fd.get('email') || '').trim();
    const displayName = String(fd.get('displayName') || '').trim() || undefined;
    const phone = String(fd.get('phone') || '').trim() || undefined;
    const marketingOptIn = fd.get('marketingOptIn') === 'on';
    const r = await adminCreateCrmContact({ email, displayName, phone, marketingOptIn });
    if (!r.ok) {
      if (addMsg) addMsg.textContent = r.error || 'Erreur';
      return;
    }
    addForm.reset();
    if (addMsg) addMsg.textContent = 'Contact enregistré.';
    closeDrawer();
    await load();
  });

  async function sendBulk(mode) {
    if (sendMsg) sendMsg.textContent = '';
    const subject = String(document.getElementById('adminCrmMailSubject')?.value || '').trim();
    const htmlContent = String(document.getElementById('adminCrmMailBody')?.value || '').trim();
    const onlyOptIn = document.getElementById('adminCrmOnlyOptIn') instanceof HTMLInputElement
      ? document.getElementById('adminCrmOnlyOptIn').checked
      : true;
    if (!subject) {
      if (sendMsg) sendMsg.textContent = 'Indiquez un objet.';
      return;
    }
    if (!htmlContent) {
      if (sendMsg) sendMsg.textContent = 'Indiquez un message HTML.';
      return;
    }
    const ids = mode === 'selection' ? selectedIds() : [];
    if (mode === 'selection' && ids.length === 0) {
      if (sendMsg) sendMsg.textContent = 'Cochez au moins un contact.';
      return;
    }
    if (
      mode === 'all' &&
      !window.confirm(
        'Envoyer cet e-mail à tous les contacts correspondant à la recherche et au filtre d’opt-in ?',
      )
    ) {
      return;
    }
    const searchEl = document.getElementById('adminCrmSearch');
    const searchQuery =
      mode === 'all' && searchEl && 'value' in searchEl ? String(searchEl.value || '').trim() : '';

    const r = await adminCrmSendBulkEmail({
      subject,
      htmlContent: `<div style="font-family:system-ui,sans-serif;line-height:1.5;max-width:560px">${htmlContent}</div>`,
      mode: mode === 'selection' ? 'selection' : 'all',
      contactIds: mode === 'selection' ? ids : [],
      onlyOptIn,
      searchQuery,
      marketingOptInFilter: mode === 'all' ? marketingOptIn || undefined : undefined,
    });
    if (!r.ok) {
      if (sendMsg) sendMsg.textContent = r.error || 'Erreur';
      return;
    }
    if (sendMsg) {
      sendMsg.textContent = `Envoyé : ${r.sent} / ${r.total}${r.skipped ? ` (ignorés config Brevo : ${r.skipped})` : ''}${r.failed ? ` — échecs : ${r.failed}` : ''}`;
    }
  }

  btnSendSel?.addEventListener('click', () => sendBulk('selection'));
  btnSendAll?.addEventListener('click', () => sendBulk('all'));

  let searchTimer;
  search?.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      q = String(search.value || '').trim();
      page = 1;
      load();
    }, 320);
  });
  optFilter?.addEventListener('change', () => {
    marketingOptIn = String(optFilter.value || '').trim();
    page = 1;
    load();
  });
  prevBtn?.addEventListener('click', () => {
    if (page <= 1) return;
    page -= 1;
    load();
  });
  nextBtn?.addEventListener('click', () => {
    page += 1;
    load();
  });

  load();
}

/**
 * @param {{ reloadCatalog: () => Promise<void>, refreshUser: () => Promise<void>, currentUserId: string | undefined }} ctx
 */
export function bindAdminLessonsPage(ctx) {
  const msg = document.getElementById('adminLessonsMsg');
  const form = document.getElementById('adminNewLessonForm');
  const tbody = document.getElementById('adminLessonsTbody');
  const pagerMeta = document.getElementById('adminLessonsPagerMeta');
  const prevBtn = document.getElementById('adminLessonsPagerPrev');
  const nextBtn = document.getElementById('adminLessonsPagerNext');
  const search = document.getElementById('adminLessonsSearch');
  const tagFilter = document.getElementById('adminLessonsTagFilter');
  const kpiTotal = document.getElementById('adminLessonsKpiTotal');
  const kpiDesc = document.getElementById('adminLessonsKpiDesc');
  const kpiNotebook = document.getElementById('adminLessonsKpiNotebook');
  const kpiTags = document.getElementById('adminLessonsKpiTags');
  const openDrawerBtn = document.getElementById('adminLessonNewBtn');
  const drawer = document.getElementById('adminLessonDrawer');
  const drawerOverlay = document.getElementById('adminLessonDrawerOverlay');
  const closeDrawerBtn = document.getElementById('adminLessonDrawerClose');
  const cancelDrawerBtn = document.getElementById('adminLessonDrawerCancel');
  let lessonPage = 1;
  let searchDebounce = null;

  async function showMsg(text, isErr) {
    if (!msg) return;
    msg.textContent = text;
    msg.style.color = isErr ? 'var(--on-surface)' : '';
    if (!isErr && text) setTimeout(() => { msg.textContent = ''; }, 2500);
  }

  function closeDrawer() {
    if (!drawer || !drawerOverlay) return;
    drawer.classList.remove('admin-drawer--open');
    drawer.setAttribute('aria-hidden', 'true');
    drawerOverlay.hidden = true;
  }

  function openDrawer() {
    if (!drawer || !drawerOverlay) return;
    drawer.classList.add('admin-drawer--open');
    drawer.setAttribute('aria-hidden', 'false');
    drawerOverlay.hidden = false;
  }

  openDrawerBtn?.addEventListener('click', openDrawer);
  closeDrawerBtn?.addEventListener('click', closeDrawer);
  cancelDrawerBtn?.addEventListener('click', closeDrawer);
  drawerOverlay?.addEventListener('click', closeDrawer);

  function applyLessonsPagination() {
    if (!tbody || !pagerMeta || !prevBtn || !nextBtn) return;
    const rows = Array.from(tbody.querySelectorAll('tr[data-lesson-id]'));
    const q = String(search?.value || '').trim().toLowerCase();
    const tag = String(tagFilter?.value || '').trim().toLowerCase();
    const filteredRows = rows.filter((row) => {
      if (!(row instanceof HTMLElement)) return false;
      const hay = String(row.getAttribute('data-search') || '').toLowerCase();
      const rowTag = String(row.getAttribute('data-tag') || '').toLowerCase();
      if (q && !hay.includes(q)) return false;
      if (tag && rowTag !== tag) return false;
      return true;
    });

    const total = filteredRows.length;
    const totalPages = Math.max(1, Math.ceil(total / ADMIN_LESSONS_PAGE_SIZE) || 1);
    lessonPage = Math.min(Math.max(1, lessonPage), totalPages);
    const fromIdx = total === 0 ? 0 : (lessonPage - 1) * ADMIN_LESSONS_PAGE_SIZE;
    const toIdx = Math.min(total, lessonPage * ADMIN_LESSONS_PAGE_SIZE);

    rows.forEach((row) => {
      row.style.display = 'none';
    });
    filteredRows.forEach((row, idx) => {
      row.style.display = idx >= fromIdx && idx < toIdx ? '' : 'none';
    });
    const from = total === 0 ? 0 : fromIdx + 1;
    pagerMeta.textContent = `${total} leçon(s) · lignes ${from}-${toIdx} · page ${lessonPage} / ${totalPages}`;
    prevBtn.disabled = lessonPage <= 1;
    nextBtn.disabled = lessonPage >= totalPages;

    if (kpiTotal || kpiDesc || kpiNotebook || kpiTags) {
      const descCount = filteredRows.reduce((n, row) => {
        const input = row.querySelector('[data-field="description"]');
        return n + (String(input?.value || '').trim() ? 1 : 0);
      }, 0);
      const notebookCount = filteredRows.reduce((n, row) => {
        const input = row.querySelector('[data-field="collabUrl"]');
        return n + (String(input?.value || '').trim() ? 1 : 0);
      }, 0);
      const tagsCount = new Set(
        filteredRows
          .map((row) => String(row.querySelector('[data-field="tag"]')?.value || '').trim().toLowerCase())
          .filter(Boolean),
      ).size;
      if (kpiTotal) kpiTotal.textContent = String(total);
      if (kpiDesc) kpiDesc.textContent = String(descCount);
      if (kpiNotebook) kpiNotebook.textContent = String(notebookCount);
      if (kpiTags) kpiTags.textContent = String(tagsCount);
    }
  }

  prevBtn?.addEventListener('click', () => {
    lessonPage -= 1;
    applyLessonsPagination();
  });
  nextBtn?.addEventListener('click', () => {
    lessonPage += 1;
    applyLessonsPagination();
  });
  search?.addEventListener('input', () => {
    window.clearTimeout(searchDebounce);
    searchDebounce = window.setTimeout(() => {
      lessonPage = 1;
      applyLessonsPagination();
    }, 280);
  });
  tagFilter?.addEventListener('change', () => {
    lessonPage = 1;
    applyLessonsPagination();
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const title = String(fd.get('title') || '').trim();
    const youtubeId = String(fd.get('youtubeId') || '').trim();
    const tag = String(fd.get('tag') || 'ml').trim();
    const lessonIdRaw = String(fd.get('lessonId') || '').trim();
    const collabRaw = String(fd.get('collabUrl') || '').trim();
    const descRaw = String(fd.get('description') || '').trim();
    const body = {
      title,
      youtubeId,
      tag,
      courseSlug: COURSE.slug,
      collabUrl: collabRaw || null,
      description: descRaw || null,
    };
    if (lessonIdRaw) body.lessonId = lessonIdRaw;
    const r = await adminCreateLesson(body);
    if (!r.ok) {
      await showMsg(r.error || 'Erreur', true);
      return;
    }
    form.reset();
    closeDrawer();
    await ctx.reloadCatalog();
    await showMsg('Leçon créée.', false);
    ctx.navigate('/admin/lessons');
  });

  tbody?.addEventListener('click', async (e) => {
    const el = e.target;
    if (!(el instanceof Element)) return;
    const saveBtn = el.closest('[data-save-lesson]');
    if (saveBtn) {
      const lessonId = saveBtn.getAttribute('data-save-lesson');
      const tr = saveBtn.closest('tr');
      if (!lessonId || !tr) return;
      const fields = {};
      tr.querySelectorAll('[data-field]').forEach((inp) => {
        const k = inp.getAttribute('data-field');
        if (!k) return;
        if (k === 'position') fields.position = Number(inp.value) || 1;
        else if (k === 'collabUrl') fields.collabUrl = inp.value.trim() || null;
        else if (k === 'description') fields.description = inp.value.trim() || null;
        else fields[k] = inp.value.trim();
      });
      const r = await adminPatchLesson(lessonId, fields);
      if (!r.ok) {
        await showMsg(r.error || 'Erreur', true);
        return;
      }
      await ctx.reloadCatalog();
      await showMsg('Leçon mise à jour.', false);
      return;
    }

    const delBtn = el.closest('[data-delete-lesson]');
    if (delBtn) {
      const lessonId = delBtn.getAttribute('data-delete-lesson');
      if (!lessonId) return;
      if (!confirm(`Supprimer la leçon « ${lessonId} » ? Les messages communauté liés restent orphelins côté IDs.`)) return;
      const r = await adminDeleteLesson(lessonId);
      if (!r.ok) {
        await showMsg(r.error || 'Erreur', true);
        return;
      }
      await ctx.reloadCatalog();
      ctx.navigate('/admin/lessons');
    }
  });

  applyLessonsPagination();
}

export function bindAdminUsersPage(ctx) {
  const msg = document.getElementById('adminUsersMsg');
  const tbody = document.getElementById('adminUsersTbody');
  const search = document.getElementById('adminUsersSearch');
  const roleFilter = document.getElementById('adminUsersRoleFilter');
  const pagerMeta = document.getElementById('adminUsersPagerMeta');
  const prevBtn = document.getElementById('adminUsersPagerPrev');
  const nextBtn = document.getElementById('adminUsersPagerNext');
  let page = 1;
  let searchDebounce = null;
  let rolePending = false;

  function usersRowsHtml(users) {
    if (!users.length) return '<tr><td colspan="6" class="muted">Aucun utilisateur.</td></tr>';
    return users
      .map((u) => {
        const id = esc(u.id);
        const displayName = esc(u.displayName || 'Sans nom');
        const email = esc(u.email);
        const isAdmin = u.role === 'admin';
        return `<tr data-user-id="${id}">
          <td><a data-router href="/admin/users/${id}" class="admin-user-link"><span class="admin-user-link-name">${displayName}</span><span class="admin-user-link-email muted">${email}</span></a></td>
          <td><div class="admin-role-toggle" data-user-role-toggle="${id}">
            <button type="button" class="admin-role-toggle-btn ${isAdmin ? '' : 'is-active'}" data-set-role="${id}:learner">Learner</button>
            <button type="button" class="admin-role-toggle-btn ${isAdmin ? 'is-active' : ''}" data-set-role="${id}:admin">Admin</button>
          </div></td>
          <td class="muted">${u.enrollments}</td>
          <td class="muted">${u.progressRows}</td>
          <td><time datetime="${esc(u.createdAt)}">${new Date(u.createdAt).toLocaleDateString('fr-FR')}</time></td>
          <td><a data-router href="/admin/users/${id}" class="btn btn-secondary btn-sm">Fiche</a></td>
        </tr>`;
      })
      .join('');
  }

  async function showMessage(text, isError = false) {
    if (!msg) return;
    msg.textContent = text;
    msg.style.color = isError ? 'var(--on-surface)' : '';
    if (!isError && text) {
      window.setTimeout(() => {
        if (msg.textContent === text) msg.textContent = '';
      }, 2000);
    }
  }

  async function loadUsers({ resetPage = false } = {}) {
    if (!tbody) return;
    if (resetPage) page = 1;
    const q = String(search?.value || '').trim();
    const role = String(roleFilter?.value || '').trim();
    if (prevBtn) prevBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;
    const r = await fetchAdminUsersList({ q: q || undefined, role: role || undefined, page, pageSize: 25 });
    if (!r.ok) {
      await showMessage(r.error || 'Impossible de charger les utilisateurs.', true);
      return;
    }
    page = r.page ?? page;
    tbody.innerHTML = usersRowsHtml(r.users || []);
    if (pagerMeta) pagerMeta.textContent = `Page ${r.page ?? 1} / ${r.totalPages ?? 1} · ${r.total ?? 0} utilisateur(s)`;
    if (prevBtn) prevBtn.disabled = (r.page ?? 1) <= 1;
    if (nextBtn) nextBtn.disabled = (r.page ?? 1) >= (r.totalPages ?? 1);
  }

  search?.addEventListener('input', () => {
    window.clearTimeout(searchDebounce);
    searchDebounce = window.setTimeout(() => loadUsers({ resetPage: true }), 320);
  });
  roleFilter?.addEventListener('change', () => loadUsers({ resetPage: true }));
  prevBtn?.addEventListener('click', () => {
    if (page <= 1) return;
    page -= 1;
    loadUsers();
  });
  nextBtn?.addEventListener('click', () => {
    page += 1;
    loadUsers();
  });

  tbody?.addEventListener('click', async (e) => {
    const el = e.target;
    if (!(el instanceof Element)) return;
    const btn = el.closest('[data-set-role]');
    if (!(btn instanceof HTMLButtonElement)) return;
    if (rolePending) return;
    const payload = String(btn.getAttribute('data-set-role') || '');
    const [userId, role] = payload.split(':');
    if (!userId || (role !== 'learner' && role !== 'admin')) return;
    rolePending = true;
    btn.disabled = true;
    const r = await adminPatchUser(userId, { role });
    rolePending = false;
    btn.disabled = false;
    if (!r.ok) {
      await showMessage(r.error || 'Erreur', true);
      return;
    }
    if (userId === ctx.currentUserId) await ctx.refreshUser();
    await showMessage('Rôle mis à jour.');
    await loadUsers();
  });
}

export function bindAdminUserDetailPage(ctx) {
  const msg = document.getElementById('adminUserDetailMsg');
  const wrap = document.querySelector('.admin-user-detail');
  if (!wrap) return;

  wrap.addEventListener('click', async (e) => {
    const el = e.target;
    if (!(el instanceof Element)) return;
    const btn = el.closest('[data-set-role]');
    if (!(btn instanceof HTMLButtonElement)) return;
    const payload = String(btn.getAttribute('data-set-role') || '');
    const [userId, role] = payload.split(':');
    if (!userId || (role !== 'learner' && role !== 'admin')) return;
    const r = await adminPatchUser(userId, { role });
    if (!r.ok) {
      if (msg) msg.textContent = r.error || 'Erreur';
      return;
    }
    if (userId === ctx.currentUserId) await ctx.refreshUser();
    if (msg) msg.textContent = 'Rôle mis à jour.';
    window.setTimeout(() => {
      if (msg) msg.textContent = '';
    }, 1800);
    ctx.navigate(`/admin/users/${encodeURIComponent(userId)}`);
  });
}
