import {
  backendMode,
  fetchAdminOverview,
  fetchAdminUsersList,
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
      return `
      <tr data-lesson-id="${id}">
        <td><code class="admin-code">${id}</code></td>
        <td><input type="text" class="admin-field" data-field="title" value="${esc(L.title)}" /></td>
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

  const newForm = `
    <section class="admin-new-lesson surface-container-low">
      <h2 class="h3">Ajouter une leçon</h2>
      <form id="adminNewLessonForm" class="admin-form-grid">
        <label>Titre<input type="text" name="title" required placeholder="Titre de la session" /></label>
        <label>ID YouTube (vidéo)<input type="text" name="youtubeId" required placeholder="ex. dQw4w9WgXcQ" /></label>
        <label>Tag module<input type="text" name="tag" value="ml" /></label>
        <label>ID leçon (optionnel)<input type="text" name="lessonId" placeholder="${esc(COURSE.slug)}-0123 — laisser vide pour auto" /></label>
        <label class="admin-form-span2">Lien Colab / corrigé<input type="url" name="collabUrl" placeholder="https://colab.research.google.com/..." /></label>
        <div class="admin-form-actions">
          <button type="submit" class="btn btn-primary">Créer la leçon</button>
        </div>
      </form>
    </section>`;

  const inner = `
    <header class="admin-page-head">
      <h1 class="h1">Leçons</h1>
      <p class="muted body-lg">Modifier le catalogue vidéo et les ressources associées.</p>
    </header>
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
    ${neon ? newForm : `<p class="muted">Mode local : le catalogue est lu depuis le fichier, pas d’édition API.</p>`}
    <p id="adminLessonsMsg" class="admin-msg form-error" role="status"></p>
    <div class="admin-table-wrap">
      <table class="admin-table admin-table--lessons">
        <thead>
          <tr>
            <th>ID</th>
            <th>Titre</th>
            <th>YouTube ID</th>
            <th>Tag</th>
            <th>Pos.</th>
            <th>Notebook</th>
            <th></th>
          </tr>
        </thead>
        <tbody>${rows || `<tr><td colspan="7" class="muted">Aucune leçon.</td></tr>`}</tbody>
      </table>
    </div>`;

  return wrapAdminPage('lessons', inner, user);
}

export async function renderAdminUsersHtml(user) {
  const neon = backendMode() === 'neon';
  const list = neon ? await fetchAdminUsersList() : { ok: false, users: [] };
  const users = list.ok ? list.users : [];

  const rows = users
    .map((u) => {
      const id = esc(u.id);
      const roleSel = (val) =>
        `<option value="${val}" ${u.role === val ? 'selected' : ''}>${val === 'admin' ? 'Admin' : 'Learner'}</option>`;
      return `
      <tr data-user-id="${id}">
        <td><code class="admin-code">${esc(u.email)}</code></td>
        <td>${esc(u.displayName)}</td>
        <td class="muted">${u.enrollments}</td>
        <td class="muted">${u.progressRows}</td>
        <td><time datetime="${esc(u.createdAt)}">${new Date(u.createdAt).toLocaleDateString('fr-FR')}</time></td>
        <td>
          <select class="admin-role-select" data-user-role="${id}" aria-label="Rôle ${esc(u.email)}">
            ${roleSel('learner')}
            ${roleSel('admin')}
          </select>
        </td>
        <td><button type="button" class="btn btn-secondary btn-sm" data-save-user-role="${id}">Appliquer</button></td>
      </tr>`;
    })
    .join('');

  const inner = `
    <header class="admin-page-head">
      <h1 class="h1">Utilisateurs</h1>
      <p class="muted body-lg">Rôles et activité (inscriptions, lignes de progression).</p>
    </header>
    ${
      !neon
        ? `<p class="muted">Mode local : pas de liste centralisée.</p>`
        : ''
    }
    <p id="adminUsersMsg" class="admin-msg form-error" role="status"></p>
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead>
          <tr>
            <th>E-mail</th>
            <th>Nom affiché</th>
            <th>Inscriptions</th>
            <th>Progression</th>
            <th>Inscription</th>
            <th>Rôle</th>
            <th></th>
          </tr>
        </thead>
        <tbody>${rows || `<tr><td colspan="7" class="muted">Aucun utilisateur.</td></tr>`}</tbody>
      </table>
    </div>
    <p class="muted small admin-footnote">Le dernier administrateur ne peut pas être rétrogradé (protection serveur).</p>`;

  return wrapAdminPage('users', inner, user);
}

export async function renderAdminCrmHtml(user) {
  const neon = backendMode() === 'neon';
  const data = neon ? await fetchAdminCrmContacts({ page: 1, pageSize: 25 }) : { ok: false, contacts: [] };
  const contacts = data.ok ? data.contacts : [];

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
      <h1 class="h1">Contacts (CRM)</h1>
      <p class="muted body-lg">E-mails issus des inscriptions webinaires et de la formation — utilisés pour les annonces (opt-in) via Brevo.</p>
    </header>
    ${
      !neon
        ? `<p class="muted">Mode local : pas de CRM.</p>`
        : ''
    }
    ${
      neon
        ? `<section class="admin-crm-toolbar surface-container-low" aria-label="Outils liste contacts">
      <div class="admin-crm-toolbar-row">
        <label class="admin-crm-search-wrap">Rechercher
          <input type="search" id="adminCrmSearch" placeholder="E-mail ou nom" class="admin-field" autocomplete="off" />
        </label>
        <div class="admin-crm-toolbar-end">
          <span id="adminCrmSelectionHint" class="admin-crm-selection-hint muted small" aria-live="polite">Aucune sélection</span>
          <div class="admin-crm-toolbar-actions">
            <button type="button" class="btn btn-primary btn-sm" id="adminCrmSendSelected">Envoyer à la sélection</button>
            <button type="button" class="btn btn-secondary btn-sm" id="adminCrmSendAll" title="Tous les contacts correspondant à la recherche et au filtre opt-in">Envoyer à tous</button>
          </div>
        </div>
      </div>
      <p id="adminCrmPager" class="admin-crm-toolbar-pager muted small" role="status"></p>
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
        ? `<div class="admin-crm-panels">
    <section class="admin-crm-add surface-container-low">
      <h2 class="h3">Ajouter un contact</h2>
      <form id="adminCrmAddForm" class="admin-form-grid admin-form-grid--crm-add">
        <label>E-mail <input type="email" name="email" required autocomplete="email" placeholder="contact@exemple.com" class="admin-field" /></label>
        <label>Nom <input type="text" name="displayName" autocomplete="name" placeholder="Prénom Nom" class="admin-field" /></label>
        <label>Téléphone <input type="tel" name="phone" autocomplete="tel" placeholder="+229 …" class="admin-field" /></label>
        <label class="admin-form-span3 admin-crm-opt-in-label"><input type="checkbox" name="marketingOptIn" /> Accepte les e-mails d’annonces La Forge Hub</label>
        <div class="admin-form-actions admin-form-span3"><button type="submit" class="btn btn-primary">Enregistrer dans le CRM</button></div>
      </form>
      <p id="adminCrmAddMsg" class="admin-msg" role="status"></p>
    </section>
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
  const pager = document.getElementById('adminCrmPager');
  const search = document.getElementById('adminCrmSearch');
  const msg = document.getElementById('adminCrmMsg');
  const selectPage = document.getElementById('adminCrmSelectPage');
  const selectionHint = document.getElementById('adminCrmSelectionHint');
  const addForm = document.getElementById('adminCrmAddForm');
  const addMsg = document.getElementById('adminCrmAddMsg');
  const sendMsg = document.getElementById('adminCrmSendMsg');
  const btnSendSel = document.getElementById('adminCrmSendSelected');
  const btnSendAll = document.getElementById('adminCrmSendAll');
  let page = 1;
  let q = '';

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

  async function load() {
    if (!tbody) return;
    const r = await fetchAdminCrmContacts({ page, pageSize: 25, q });
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

  load();
}

/**
 * @param {{ reloadCatalog: () => Promise<void>, refreshUser: () => Promise<void>, currentUserId: string | undefined }} ctx
 */
export function bindAdminLessonsPage(ctx) {
  const msg = document.getElementById('adminLessonsMsg');
  const form = document.getElementById('adminNewLessonForm');

  async function showMsg(text, isErr) {
    if (!msg) return;
    msg.textContent = text;
    msg.style.color = isErr ? 'var(--on-surface)' : '';
    if (!isErr && text) setTimeout(() => { msg.textContent = ''; }, 2500);
  }

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const title = String(fd.get('title') || '').trim();
    const youtubeId = String(fd.get('youtubeId') || '').trim();
    const tag = String(fd.get('tag') || 'ml').trim();
    const lessonIdRaw = String(fd.get('lessonId') || '').trim();
    const collabRaw = String(fd.get('collabUrl') || '').trim();
    const body = {
      title,
      youtubeId,
      tag,
      courseSlug: COURSE.slug,
      collabUrl: collabRaw || null,
    };
    if (lessonIdRaw) body.lessonId = lessonIdRaw;
    const r = await adminCreateLesson(body);
    if (!r.ok) {
      await showMsg(r.error || 'Erreur', true);
      return;
    }
    form.reset();
    await ctx.reloadCatalog();
    await showMsg('Leçon créée.', false);
    ctx.navigate('/admin/lessons');
  });

  document.querySelectorAll('[data-save-lesson]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const lessonId = btn.getAttribute('data-save-lesson');
      const tr = btn.closest('tr');
      if (!lessonId || !tr) return;
      const fields = {};
      tr.querySelectorAll('[data-field]').forEach((inp) => {
        const k = inp.getAttribute('data-field');
        if (!k) return;
        if (k === 'position') fields.position = Number(inp.value) || 1;
        else if (k === 'collabUrl') fields.collabUrl = inp.value.trim() || null;
        else fields[k] = inp.value.trim();
      });
      const r = await adminPatchLesson(lessonId, fields);
      if (!r.ok) {
        await showMsg(r.error || 'Erreur', true);
        return;
      }
      await ctx.reloadCatalog();
      await showMsg('Leçon mise à jour.', false);
    });
  });

  document.querySelectorAll('[data-delete-lesson]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const lessonId = btn.getAttribute('data-delete-lesson');
      if (!lessonId) return;
      if (!confirm(`Supprimer la leçon « ${lessonId} » ? Les messages communauté liés restent orphelins côté IDs.`)) return;
      const r = await adminDeleteLesson(lessonId);
      if (!r.ok) {
        await showMsg(r.error || 'Erreur', true);
        return;
      }
      await ctx.reloadCatalog();
      ctx.navigate('/admin/lessons');
    });
  });
}

export function bindAdminUsersPage(ctx) {
  const msg = document.getElementById('adminUsersMsg');
  document.querySelectorAll('[data-save-user-role]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const userId = btn.getAttribute('data-save-user-role');
      if (!userId) return;
      const sel = document.querySelector(`select[data-user-role="${userId}"]`);
      const role = sel?.value;
      if (role !== 'learner' && role !== 'admin') return;
      if (msg) msg.textContent = '';
      const r = await adminPatchUser(userId, { role });
      if (!r.ok) {
        if (msg) msg.textContent = r.error || 'Erreur';
        return;
      }
      if (userId === ctx.currentUserId) await ctx.refreshUser();
      if (msg) {
        msg.textContent = 'Rôle mis à jour.';
        setTimeout(() => { msg.textContent = ''; }, 2000);
      }
    });
  });
}
