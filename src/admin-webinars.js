import {
  backendMode,
  fetchAdminWebinars,
  fetchAdminWebinar,
  adminCreateWebinar,
  adminPatchWebinar,
  adminDeleteWebinar,
  fetchAdminWebinarRegistrations,
} from './api.js';
import { COURSE } from './seed-data.js';
import { wrapAdminPage } from './admin.js';

function esc(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function toDatetimeLocalValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const ADMIN_WEBINAR_FLASH_KEY = 'admin_webinar_flash_v1';

function readFlash() {
  try {
    const raw = sessionStorage.getItem(ADMIN_WEBINAR_FLASH_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function consumeFlash() {
  const f = readFlash();
  sessionStorage.removeItem(ADMIN_WEBINAR_FLASH_KEY);
  return f;
}

function statusMeta(w) {
  let s = w.lifecycle || '';
  if (!s) {
    const hasReplay = !!(w.recordingUrl && String(w.recordingUrl).trim()) || w.kind === 'ARCHIVE';
    if (hasReplay) s = 'REPLAY_READY';
    else if (w.kind === 'EVENT' && w.startsAt && new Date(w.startsAt) > new Date()) s = 'UPCOMING';
    else if (w.kind === 'EVENT' && w.startsAt && new Date(w.startsAt) <= new Date()) s = 'PAST_NEEDS_REPLAY';
    else s = 'DRAFT';
  }
  if (s === 'UPCOMING') return { code: s, label: 'A venir', className: 'is-upcoming' };
  if (s === 'REPLAY_READY') return { code: s, label: 'Replay', className: 'is-replay' };
  if (s === 'PAST_NEEDS_REPLAY') return { code: s, label: 'Replay manquant', className: 'is-needs-replay' };
  return { code: 'DRAFT', label: 'Brouillon', className: 'is-draft' };
}

const ADMIN_WEBINARS_PAGE_SIZE = 15;

function webinarTableRowsHtml(list, highlightedId) {
  if (!list.length) {
    return `<tr><td colspan="6" class="muted">Aucun webinaire pour cette page ou ces filtres.</td></tr>`;
  }
  return list
    .map((w) => {
      const id = esc(w.id);
      const status = statusMeta(w);
      const when = w.startsAt ? new Date(w.startsAt).toLocaleString('fr-FR') : '—';
      const rowClass = highlightedId === w.id ? 'admin-webinar-row is-highlighted' : 'admin-webinar-row';
      return `
      <tr data-webinar-id="${id}" data-lifecycle="${esc(status.code)}" data-search="${esc(`${w.title} ${w.tag}`.toLowerCase())}" class="${rowClass}">
        <td><span class="admin-webinar-status ${status.className}">${esc(status.label)}</span></td>
        <td>
          <a data-router href="/admin/webinars/${id}" class="admin-link-title">${esc(w.title)}</a>
          <div class="muted small">${when}${w.published ? '' : ' · Non publié'}</div>
        </td>
        <td>${esc(w.tag)}</td>
        <td>${w.registrationCount ?? 0}</td>
        <td>${w.replayViewCount ?? 0}</td>
        <td class="admin-actions">
          <a data-router href="/admin/webinars/${id}" class="btn btn-secondary btn-sm">Ouvrir</a>
          <button type="button" class="admin-icon-btn admin-icon-btn--danger" data-delete-webinar="${id}" aria-label="Supprimer" title="Supprimer">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </td>
      </tr>`;
    })
    .join('');
}

function webinarPagerMetaText({ total, page, pageSize, totalPages }) {
  if (total === 0) return '0 résultat';
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return `${total} résultat(s) · lignes ${from}–${to} · page ${page} / ${totalPages}`;
}

export async function renderAdminWebinarsHtml(user) {
  const neon = backendMode() === 'neon';
  const fetched = neon
    ? await fetchAdminWebinars({ page: 1, pageSize: ADMIN_WEBINARS_PAGE_SIZE })
    : {
        ok: false,
        webinars: [],
        total: 0,
        page: 1,
        pageSize: ADMIN_WEBINARS_PAGE_SIZE,
        totalPages: 1,
        replayMissingCount: 0,
        firstReplayMissingId: null,
        totals: { total: 0, upcoming: 0, replayReady: 0, replayMissing: 0, replayViews: 0 },
      };
  const list = fetched.ok ? fetched.webinars : [];
  const flash = consumeFlash();
  const highlightedId = flash?.id || '';
  const rmCount = fetched.ok ? fetched.replayMissingCount : 0;
  const firstReplayMissingId = fetched.ok ? fetched.firstReplayMissingId : null;
  const completeBtn =
    rmCount > 0 && firstReplayMissingId
      ? `<a data-router class="btn btn-secondary btn-sm" href="/admin/webinars/${esc(firstReplayMissingId)}">Compléter maintenant</a>`
      : '';
  const reminder =
    rmCount > 0
      ? `<div class="admin-webinar-reminder" id="adminWebinarReminder" data-count="${rmCount}">
        <p><strong>${rmCount}</strong> webinaire(s) passé(s) attend(ent) un replay.</p>
        ${completeBtn}
      </div>`
      : '';
  const flashMsg = flash?.text
    ? `<p id="adminWebinarsMsgInline" class="admin-msg admin-msg--success">${esc(flash.text)}</p>`
    : '';

  const meta = {
    total: fetched.total ?? list.length,
    page: fetched.page ?? 1,
    pageSize: fetched.pageSize ?? ADMIN_WEBINARS_PAGE_SIZE,
    totalPages: fetched.totalPages ?? 1,
  };
  const rows = webinarTableRowsHtml(list, highlightedId);
  const pagerMeta = webinarPagerMetaText({ ...meta, total: meta.total });
  const prevDisabled = meta.page <= 1 ? 'disabled' : '';
  const nextDisabled = meta.page >= meta.totalPages ? 'disabled' : '';
  const totals = fetched.totals || { total: 0, upcoming: 0, replayReady: 0, replayMissing: 0, replayViews: 0 };

  const drawer = `
    <div id="adminWebinarDrawerOverlay" class="admin-drawer-overlay" hidden></div>
    <aside id="adminWebinarDrawer" class="admin-drawer" aria-hidden="true">
      <div class="admin-drawer-head">
        <h2 class="h3">Nouveau webinaire</h2>
        <button type="button" class="admin-drawer-close" id="adminWebinarDrawerClose" aria-label="Fermer">×</button>
      </div>
      <p class="muted body-sm admin-form-intro">Créez d’abord la session (date, lieu). Vous pourrez ajouter le <strong>lien du replay</strong> après la diffusion.</p>
      <form id="adminNewWebinarForm" class="admin-form-grid admin-form-grid--webinar">
        <label><span class="admin-label-text">Titre</span><input type="text" name="title" required placeholder="Titre" /></label>
        <label class="admin-form-span2"><span class="admin-label-text">Description</span><textarea name="description" rows="4" required placeholder="Description courte"></textarea></label>
        <label><span class="admin-label-text">Tag</span><input type="text" name="tag" required placeholder="ex. ml" /></label>
        <div class="admin-webinar-event-fields">
          <label><span class="admin-label-text">Date et heure</span><input type="datetime-local" name="startsAt" required /></label>
          <label><span class="admin-label-text">Lieu</span>
            <select name="locationType" id="webinarLocationType">
              <option value="ONLINE">En ligne</option>
              <option value="ONSITE">Présentiel</option>
            </select>
          </label>
          <label class="admin-webinar-field-full"><span class="admin-label-text">Lien visio (si en ligne)</span><input type="url" name="onlineLink" id="webinarOnlineLink" placeholder="https://zoom… ou meet…" /></label>
          <label class="admin-webinar-field-full"><span class="admin-label-text">Lieu / salle (si présentiel)</span><input type="text" name="venue" id="webinarVenue" placeholder="Adresse ou salle" autocomplete="address-line1" /></label>
          <label class="admin-webinar-field-full"><span class="admin-label-text">URL bannière (image)</span><input type="url" name="bannerUrl" placeholder="https://…jpg" /></label>
        </div>
        <div class="admin-form-actions">
          <button type="submit" class="btn btn-primary">Créer</button>
          <button type="button" class="btn btn-secondary" id="adminWebinarDrawerCancel">Annuler</button>
        </div>
      </form>
    </aside>`;

  const inner = `
    <header class="admin-page-head">
      <div class="admin-page-head-row">
        <div>
          <h1 class="h1">Webinaires</h1>
          <p class="muted body-lg">Liste des sessions et replays, avec suivi des inscriptions et vues.</p>
        </div>
        ${neon ? '<button type="button" id="adminWebinarNewBtn" class="btn btn-primary">+ Nouveau webinaire</button>' : ''}
      </div>
    </header>
    ${neon ? `
      <section class="admin-kpi-row">
        <article class="admin-kpi-card surface-container-low"><span class="muted small">Total</span><strong>${totals.total ?? 0}</strong></article>
        <article class="admin-kpi-card surface-container-low"><span class="muted small">A venir</span><strong>${totals.upcoming ?? 0}</strong></article>
        <article class="admin-kpi-card surface-container-low"><span class="muted small">Replay prêt</span><strong>${totals.replayReady ?? 0}</strong></article>
        <article class="admin-kpi-card surface-container-low"><span class="muted small">Replay manquant</span><strong>${totals.replayMissing ?? 0}</strong></article>
        <article class="admin-kpi-card surface-container-low"><span class="muted small">Vues replay</span><strong>${totals.replayViews ?? 0}</strong></article>
      </section>` : `<p class="muted">Mode local : gestion des webinaires indisponible.</p>`}
    ${reminder}
    ${flashMsg}
    <p id="adminWebinarsMsg" class="admin-msg form-error" role="status"></p>
    <div class="admin-toolbar admin-webinar-toolbar">
      <label>
        <span class="admin-label-text">Recherche</span>
        <input id="adminWebinarSearch" type="search" placeholder="Titre ou tag" />
      </label>
      <label>
        <span class="admin-label-text">Filtre statut</span>
        <select id="adminWebinarFilterStatus">
          <option value="">Tous</option>
          <option value="UPCOMING">A venir</option>
          <option value="PAST_NEEDS_REPLAY">Replay manquant</option>
          <option value="REPLAY_READY">Replay pret</option>
        </select>
      </label>
      <label>
        <span class="admin-label-text">Publication</span>
        <select id="adminWebinarFilterPublished">
          <option value="">Tous</option>
          <option value="true">Publiés</option>
          <option value="false">Non publiés</option>
        </select>
      </label>
    </div>
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead>
          <tr>
            <th>Statut</th>
            <th>Titre</th>
            <th>Tag</th>
            <th>Inscrits</th>
            <th>Vues replay</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody id="adminWebinarsTbody">${rows}</tbody>
      </table>
    </div>
    <nav class="admin-webinars-pager" id="adminWebinarsPager" aria-label="Pagination des webinaires">
      <p class="admin-webinars-pager-meta" id="adminWebinarsPagerMeta">${esc(pagerMeta)}</p>
      <div class="admin-webinars-pager-btns">
        <button type="button" class="btn btn-secondary btn-sm" id="adminWebinarsPagerPrev" ${prevDisabled}>Précédent</button>
        <button type="button" class="btn btn-secondary btn-sm" id="adminWebinarsPagerNext" ${nextDisabled}>Suivant</button>
      </div>
    </nav>
    ${neon ? drawer : ''}`;

  return wrapAdminPage('webinars', inner, user);
}

/**
 * @param {{ navigate: (path: string) => void }} ctx
 */
export function bindAdminWebinarsPage(ctx) {
  const msg = document.getElementById('adminWebinarsMsg');
  const form = document.getElementById('adminNewWebinarForm');
  const filterStatus = document.getElementById('adminWebinarFilterStatus');
  const filterPublished = document.getElementById('adminWebinarFilterPublished');
  const filterSearch = document.getElementById('adminWebinarSearch');
  const tbody = document.getElementById('adminWebinarsTbody');
  const pagerMeta = document.getElementById('adminWebinarsPagerMeta');
  const prevBtn = document.getElementById('adminWebinarsPagerPrev');
  const nextBtn = document.getElementById('adminWebinarsPagerNext');
  const openDrawerBtn = document.getElementById('adminWebinarNewBtn');
  const drawer = document.getElementById('adminWebinarDrawer');
  const drawerOverlay = document.getElementById('adminWebinarDrawerOverlay');
  const closeDrawerBtn = document.getElementById('adminWebinarDrawerClose');
  const cancelDrawerBtn = document.getElementById('adminWebinarDrawerCancel');
  const locSel = document.getElementById('webinarLocationType');
  const onlineIn = document.getElementById('webinarOnlineLink');
  const venueIn = document.getElementById('webinarVenue');
  const neon = backendMode() === 'neon';

  let page = 1;
  let searchDebounce = null;

  function syncLocation() {
    const isOnline = locSel?.value === 'ONLINE';
    if (onlineIn) {
      onlineIn.required = !!isOnline;
      onlineIn.disabled = !isOnline;
    }
    if (venueIn) {
      venueIn.disabled = !!isOnline;
    }
  }
  locSel?.addEventListener('change', syncLocation);
  syncLocation();

  function closeDrawer() {
    if (!drawer || !drawerOverlay) return;
    drawer.setAttribute('aria-hidden', 'true');
    drawer.classList.remove('admin-drawer--open');
    drawerOverlay.hidden = true;
  }

  function openDrawer() {
    if (!drawer || !drawerOverlay) return;
    drawer.setAttribute('aria-hidden', 'false');
    drawer.classList.add('admin-drawer--open');
    drawerOverlay.hidden = false;
  }

  openDrawerBtn?.addEventListener('click', openDrawer);
  closeDrawerBtn?.addEventListener('click', closeDrawer);
  cancelDrawerBtn?.addEventListener('click', closeDrawer);
  drawerOverlay?.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDrawer();
  });

  async function loadWebinarTable({ resetPage = false } = {}) {
    if (!neon || !tbody) return;
    if (resetPage) page = 1;
    const lifecycle = String(filterStatus?.value || '').trim();
    const published = String(filterPublished?.value || '').trim();
    const q = String(filterSearch?.value || '').trim();
    if (prevBtn) prevBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;
    const r = await fetchAdminWebinars({
      page,
      pageSize: ADMIN_WEBINARS_PAGE_SIZE,
      lifecycle: lifecycle || undefined,
      published: published || undefined,
      q: q || undefined,
    });
    if (!r.ok) {
      if (prevBtn) prevBtn.disabled = page <= 1;
      if (nextBtn) nextBtn.disabled = true;
      await showMsg(r.error || 'Impossible de charger la liste.', true);
      return;
    }
    page = r.page ?? page;
    const meta = {
      total: r.total ?? 0,
      page: r.page ?? 1,
      pageSize: r.pageSize ?? ADMIN_WEBINARS_PAGE_SIZE,
      totalPages: r.totalPages ?? 1,
    };
    tbody.innerHTML = webinarTableRowsHtml(r.webinars || [], '');
    if (pagerMeta) pagerMeta.textContent = webinarPagerMetaText(meta);
    if (prevBtn) prevBtn.disabled = meta.page <= 1;
    if (nextBtn) nextBtn.disabled = meta.page >= meta.totalPages;
  }

  filterStatus?.addEventListener('change', () => {
    loadWebinarTable({ resetPage: true });
  });
  filterPublished?.addEventListener('change', () => {
    loadWebinarTable({ resetPage: true });
  });
  filterSearch?.addEventListener('input', () => {
    window.clearTimeout(searchDebounce);
    searchDebounce = window.setTimeout(() => {
      loadWebinarTable({ resetPage: true });
    }, 320);
  });
  prevBtn?.addEventListener('click', () => {
    if (page <= 1) return;
    page -= 1;
    loadWebinarTable();
  });
  nextBtn?.addEventListener('click', () => {
    page += 1;
    loadWebinarTable();
  });

  async function showMsg(text, isErr) {
    if (!msg) return;
    msg.textContent = text;
    msg.style.color = isErr ? 'var(--on-surface)' : '';
    if (!isErr && text) setTimeout(() => { msg.textContent = ''; }, 2500);
  }

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;
    const fd = new FormData(form);
    const title = String(fd.get('title') || '').trim();
    const description = String(fd.get('description') || '').trim();
    const tag = String(fd.get('tag') || '').trim();
    const dt = String(fd.get('startsAt') || '').trim();
    if (!dt) {
      await showMsg('Indiquez la date et l’heure.', true);
      if (submitBtn) submitBtn.disabled = false;
      return;
    }
    const body = {
      kind: 'EVENT',
      title,
      description,
      tag,
      published: true,
      startsAt: new Date(dt).toISOString(),
      locationType: String(fd.get('locationType') || 'ONLINE'),
    };
    const ol = String(fd.get('onlineLink') || '').trim();
    const ven = String(fd.get('venue') || '').trim();
    const ban = String(fd.get('bannerUrl') || '').trim();
    if (body.locationType === 'ONLINE' && !ol) {
      await showMsg('Lien visio requis pour un webinaire en ligne.', true);
      if (submitBtn) submitBtn.disabled = false;
      return;
    }
    if (ol) body.onlineLink = ol;
    if (ven) body.venue = ven;
    if (ban) body.bannerUrl = ban;
    const r = await adminCreateWebinar(body);
    if (!r.ok) {
      await showMsg(r.error || 'Erreur', true);
      if (submitBtn) submitBtn.disabled = false;
      return;
    }
    form.reset();
    syncLocation();
    closeDrawer();
    sessionStorage.setItem(
      ADMIN_WEBINAR_FLASH_KEY,
      JSON.stringify({ id: r.webinar?.id || null, text: 'Webinaire publie avec succes.' }),
    );
    ctx.navigate('/admin/webinars');
  });

  tbody?.addEventListener('click', async (e) => {
    const el = e.target;
    if (!(el instanceof Element)) return;
    const btn = el.closest('[data-delete-webinar]');
    if (!btn) return;
    const id = btn.getAttribute('data-delete-webinar');
    if (!id) return;
    if (!confirm('Supprimer ce webinaire et ses inscriptions ?')) return;
    const r = await adminDeleteWebinar(id);
    if (!r.ok) {
      await showMsg(r.error || 'Erreur', true);
      return;
    }
    ctx.navigate('/admin/webinars');
  });
}

export async function renderAdminWebinarDetailHtml(user, webinarId) {
  const neon = backendMode() === 'neon';
  if (!neon) {
    return wrapAdminPage(
      'webinars',
      `<p class="muted">Mode local.</p><a data-router href="/admin/webinars">Retour</a>`,
      user,
    );
  }

  const [detail, data] = await Promise.all([
    fetchAdminWebinar(webinarId),
    fetchAdminWebinarRegistrations(webinarId),
  ]);

  if (!detail.ok || !detail.webinar) {
    return wrapAdminPage(
      'webinars',
      `<p class="form-error">${esc(detail.error || 'Introuvable')}</p><a data-router href="/admin/webinars">Retour</a>`,
      user,
    );
  }

  const w = detail.webinar;
  const regs = data.ok ? data.registrations || [] : [];
  const rows = regs
    .map(
      (r) => `
    <tr>
      <td>${esc(r.email)}</td>
      <td>${esc(r.displayName || '—')}</td>
      <td>${esc(r.guestPhone || '—')}</td>
      <td>${
        r.source === 'guest'
          ? '<span class="admin-webinar-status is-draft">Invité</span>'
          : '<span class="admin-webinar-status is-upcoming">Compte</span>'
      }</td>
      <td>${r.marketingOptIn ? 'Oui' : '<span class="muted">Non</span>'}</td>
      <td><time datetime="${esc(r.registeredAt)}">${new Date(r.registeredAt).toLocaleString('fr-FR')}</time></td>
    </tr>`,
    )
    .join('');

  const startsForInput = w.startsAt || (w.kind === 'ARCHIVE' ? w.createdAt : null);
  const startsLocal = toDatetimeLocalValue(startsForInput);
  const locOnline = w.locationType === 'ONLINE' ? 'selected' : '';
  const locOnsite = w.locationType === 'ONSITE' || !w.locationType ? 'selected' : '';
  const pubChecked = w.published ? 'checked' : '';
  const replayPrompt =
    statusMeta(w).code === 'PAST_NEEDS_REPLAY'
      ? `<p class="admin-webinar-alert">Ce webinaire est termine. Ajoutez maintenant le lien du replay pour le publier dans la section Replays.</p>`
      : '';

  const editForm = `
    <section class="admin-new-lesson surface-container-low">
      <h2 class="h3">Modifier ce webinaire</h2>
      <p class="muted body-sm">Utilisez les onglets pour séparer la session, le replay et les participants.</p>
      ${replayPrompt}
      <div class="admin-tabs" id="adminWebinarTabs">
        <button type="button" class="admin-tab is-active" data-tab-target="session">Session</button>
        <button type="button" class="admin-tab" data-tab-target="replay">Replay</button>
        <button type="button" class="admin-tab" data-tab-target="participants">Participants</button>
      </div>
      <form id="adminEditWebinarForm" class="admin-form-grid admin-form-grid--webinar" data-webinar-id="${esc(w.id)}">
        <section class="admin-tab-panel is-active" data-tab-panel="session">
          <label><span class="admin-label-text">Titre</span><input type="text" name="title" required value="${esc(w.title)}" /></label>
          <label class="admin-form-span2"><span class="admin-label-text">Description</span><textarea name="description" rows="4" required>${esc(w.description)}</textarea></label>
          <label><span class="admin-label-text">Tag</span><input type="text" name="tag" required value="${esc(w.tag)}" /></label>
          <label class="admin-form-span2"><span class="admin-label-text">Publié sur le site</span><input type="checkbox" name="published" ${pubChecked} /></label>
          <div class="admin-webinar-event-fields">
            <label><span class="admin-label-text">Date et heure</span><input type="datetime-local" name="startsAt" required value="${esc(startsLocal)}" /></label>
            <label><span class="admin-label-text">Lieu</span>
              <select name="locationType" id="webinarLocationTypeEdit">
                <option value="ONLINE" ${locOnline}>En ligne</option>
                <option value="ONSITE" ${locOnsite}>Présentiel</option>
              </select>
            </label>
            <label class="admin-webinar-field-full"><span class="admin-label-text">Lien visio (si en ligne)</span><input type="url" name="onlineLink" id="webinarOnlineLinkEdit" value="${esc(w.onlineLink || '')}" placeholder="https://zoom… ou meet…" /></label>
            <label class="admin-webinar-field-full"><span class="admin-label-text">Lieu / salle (si présentiel)</span><input type="text" name="venue" id="webinarVenueEdit" value="${esc(w.venue || '')}" placeholder="Adresse ou salle" autocomplete="address-line1" /></label>
            <label class="admin-webinar-field-full"><span class="admin-label-text">URL bannière (image)</span><input type="url" name="bannerUrl" value="${esc(w.bannerUrl || '')}" placeholder="https://…jpg" /></label>
          </div>
        </section>
        <section class="admin-tab-panel" data-tab-panel="replay">
          <div class="admin-webinar-replay-block">
            <h3 class="h3">Replay (après la session)</h3>
            <p class="muted body-sm">Une fois la vidéo prête, collez le lien public (YouTube, Drive partagé, etc.).</p>
            <label class="admin-webinar-field-full"><span class="admin-label-text">Lien de l’enregistrement</span><input type="url" name="recordingUrl" value="${esc(w.recordingUrl || '')}" placeholder="https://…" /></label>
          </div>
        </section>
        <section class="admin-tab-panel" data-tab-panel="participants">
          <div class="admin-table-wrap">
            <table class="admin-table">
              <thead>
                <tr>
                  <th>E-mail</th>
                  <th>Nom</th>
                  <th>WhatsApp</th>
                  <th>Type</th>
                  <th>Annonces</th>
                  <th>Date d’inscription</th>
                </tr>
              </thead>
              <tbody>${rows || `<tr><td colspan="6" class="muted">Aucune inscription.</td></tr>`}</tbody>
            </table>
          </div>
        </section>
        <div class="admin-form-actions admin-form-span2">
          <button type="submit" class="btn btn-primary">Enregistrer</button>
          <button type="button" class="btn btn-secondary" id="adminEditWebinarCancel">Annuler</button>
          <button type="button" class="btn btn-secondary" id="adminEditWebinarDelete">Supprimer</button>
        </div>
      </form>
    </section>
    <p id="adminEditWebinarMsg" class="admin-msg form-error" role="status"></p>`;

  const inner = `
    <header class="admin-page-head">
      <h1 class="h1">${esc(w.title)}</h1>
      <p class="muted"><a data-router href="/admin/webinars">← Liste des webinaires</a></p>
    </header>
    ${editForm}
    <p class="body-lg">${esc(statusMeta(w).label)} — inscriptions : <strong>${regs.length}</strong> · vues replay : <strong>${w.replayViewCount ?? 0}</strong></p>
    <p class="muted small">Parcours catalogue : <code>${esc(COURSE.slug)}</code></p>`;

  return wrapAdminPage('webinars', inner, user);
}

/**
 * @param {{ navigate: (path: string) => void }} ctx
 */
export function bindAdminWebinarDetailPage(ctx) {
  const msg = document.getElementById('adminEditWebinarMsg');
  const form = document.getElementById('adminEditWebinarForm');
  const locSel = document.getElementById('webinarLocationTypeEdit');
  const onlineIn = document.getElementById('webinarOnlineLinkEdit');
  const venueIn = document.getElementById('webinarVenueEdit');
  const tabsWrap = document.getElementById('adminWebinarTabs');

  function syncLocation() {
    const isOnline = locSel?.value === 'ONLINE';
    if (onlineIn) {
      onlineIn.required = !!isOnline;
      onlineIn.disabled = !isOnline;
    }
    if (venueIn) {
      venueIn.disabled = !!isOnline;
    }
  }
  locSel?.addEventListener('change', syncLocation);
  syncLocation();

  tabsWrap?.addEventListener('click', (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    const tabBtn = target.closest('[data-tab-target]');
    if (!(tabBtn instanceof HTMLElement)) return;
    const tab = tabBtn.getAttribute('data-tab-target');
    if (!tab) return;
    document.querySelectorAll('.admin-tab').forEach((el) => el.classList.remove('is-active'));
    tabBtn.classList.add('is-active');
    document.querySelectorAll('.admin-tab-panel').forEach((el) => {
      if (!(el instanceof HTMLElement)) return;
      el.classList.toggle('is-active', el.getAttribute('data-tab-panel') === tab);
    });
  });

  async function showMsg(text, isErr) {
    if (!msg) return;
    msg.textContent = text;
    msg.style.color = isErr ? 'var(--on-surface)' : '';
    if (!isErr && text) setTimeout(() => { msg.textContent = ''; }, 2500);
  }

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;
    const id = form.getAttribute('data-webinar-id');
    if (!id) {
      if (submitBtn) submitBtn.disabled = false;
      return;
    }
    const fd = new FormData(form);
    const title = String(fd.get('title') || '').trim();
    const description = String(fd.get('description') || '').trim();
    const tag = String(fd.get('tag') || '').trim();
    const published = fd.get('published') === 'on';
    const dt = String(fd.get('startsAt') || '').trim();
    if (!dt) {
      await showMsg('Indiquez la date et l’heure.', true);
      if (submitBtn) submitBtn.disabled = false;
      return;
    }
    const locationType = String(fd.get('locationType') || 'ONLINE');
    const ol = String(fd.get('onlineLink') || '').trim();
    const ven = String(fd.get('venue') || '').trim();
    const ban = String(fd.get('bannerUrl') || '').trim();
    const rec = String(fd.get('recordingUrl') || '').trim();
    if (locationType === 'ONLINE' && !ol) {
      await showMsg('Lien visio requis pour un webinaire en ligne.', true);
      if (submitBtn) submitBtn.disabled = false;
      return;
    }

    /** Toujours une session EVENT ; le replay est un champ optionnel. */
    /** @type {Record<string, unknown>} */
    const body = {
      kind: 'EVENT',
      title,
      description,
      tag,
      published,
      startsAt: new Date(dt).toISOString(),
      locationType,
      onlineLink: ol || null,
      venue: ven || null,
      bannerUrl: ban || null,
      recordingUrl: rec || null,
    };

    const r = await adminPatchWebinar(id, body);
    if (!r.ok) {
      await showMsg(r.error || 'Erreur', true);
      if (submitBtn) submitBtn.disabled = false;
      return;
    }
    sessionStorage.setItem(
      ADMIN_WEBINAR_FLASH_KEY,
      JSON.stringify({ id, text: 'Webinaire mis a jour avec succes.' }),
    );
    ctx.navigate('/admin/webinars');
  });

  const del = document.getElementById('adminEditWebinarDelete');
  del?.addEventListener('click', async () => {
    const id = form?.getAttribute('data-webinar-id');
    if (!id) return;
    if (!confirm('Supprimer ce webinaire et ses inscriptions ?')) return;
    const r = await adminDeleteWebinar(id);
    if (!r.ok) {
      await showMsg(r.error || 'Erreur', true);
      return;
    }
    ctx.navigate('/admin/webinars');
  });

  const cancel = document.getElementById('adminEditWebinarCancel');
  cancel?.addEventListener('click', () => {
    ctx.navigate('/admin/webinars');
  });
}
