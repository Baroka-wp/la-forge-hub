import { fetchAdminAttestations } from './api.js';
import { wrapAdminPage } from './admin.js';

const PAGE_SIZE = 25;

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function dateLabel(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function certificateBadges(certificates) {
  return certificates
    .map(
      (certificate) => `<span class="admin-cert-badge ${certificate.ready ? 'is-ready' : 'is-missing'}">
        ${esc(certificate.kind === 'BOOTCAMP' ? 'Bootcamp' : 'NOAI')}
        <small>${certificate.ready ? `${certificate.downloadCount} téléchargement${certificate.downloadCount > 1 ? 's' : ''}` : 'fichier manquant'}</small>
      </span>`,
    )
    .join('');
}

function rowsHtml(participants) {
  if (!participants.length) return '<tr><td colspan="6" class="admin-empty-cell">Aucun participant ne correspond aux filtres.</td></tr>';
  return participants
    .map((participant) => {
      const downloads = participant.certificates.reduce((sum, certificate) => sum + certificate.downloadCount, 0);
      return `<tr>
        <td>
          <strong class="admin-cert-name">${esc(`${participant.lastName} ${participant.firstName}`)}</strong>
          <code class="admin-cert-table-number">${esc(participant.tableNumber)}</code>
        </td>
        <td>
          ${participant.email ? `<a class="admin-cert-contact" href="mailto:${esc(participant.email)}">${esc(participant.email)}</a>` : '<span class="muted">Non renseigné</span>'}
          ${participant.phone ? `<span class="admin-cert-phone">${esc(participant.phone)}</span>` : ''}
        </td>
        <td><div class="admin-cert-badges">${certificateBadges(participant.certificates)}</div></td>
        <td><strong class="admin-tabular">${participant.requestCount}</strong></td>
        <td><strong class="admin-tabular">${downloads}</strong></td>
        <td><span class="admin-cert-date">${dateLabel(participant.lastRequestAt)}</span></td>
      </tr>`;
    })
    .join('');
}

function dashboardHtml(data) {
  const totals = data.totals || {};
  const retrievalRate = totals.participants ? Math.round((Number(totals.downloadedParticipants || 0) / totals.participants) * 100) : 0;
  return `
    <header class="admin-page-head admin-page-head--certificates">
      <div>
        <p class="admin-eyebrow">Diffusion documentaire</p>
        <h1 class="h1">Attestations</h1>
        <p class="muted body-lg">Suivez les demandes, les coordonnées recueillies et les téléchargements.</p>
      </div>
      <button type="button" class="btn btn-secondary" id="adminCertificatesExport">Exporter en CSV</button>
    </header>

    <section class="admin-cert-overview">
      <article class="admin-cert-primary-stat">
        <span>Taux de retrait</span>
        <strong>${retrievalRate}<small>%</small></strong>
        <div class="admin-cert-progress"><i style="width:${retrievalRate}%"></i></div>
        <p>${totals.downloadedParticipants || 0} participants sur ${totals.participants || 0}</p>
      </article>
      <div class="admin-cert-stat-grid">
        <article><span>Attestations prêtes</span><strong>${totals.ready || 0}<small> / ${totals.certificates || 0}</small></strong></article>
        <article><span>Demandes validées</span><strong>${totals.requested || 0}</strong></article>
        <article><span>Téléchargements</span><strong>${totals.downloads || 0}</strong></article>
        <article><span>Échecs de recherche</span><strong>${totals.failedRequests || 0}</strong></article>
      </div>
    </section>

    <section class="admin-cert-list-panel">
      <div class="admin-toolbar admin-cert-toolbar">
        <label><span class="admin-label-text">Recherche</span><input id="adminCertificatesSearch" type="search" placeholder="Nom, table, e-mail ou téléphone"></label>
        <label><span class="admin-label-text">État</span><select id="adminCertificatesStatus">
          <option value="">Tous</option><option value="requested">Demande effectuée</option><option value="downloaded">Téléchargée</option><option value="not_requested">Pas encore demandée</option><option value="missing_files">Fichier manquant</option>
        </select></label>
        <label><span class="admin-label-text">Type</span><select id="adminCertificatesKind">
          <option value="">Tous</option><option value="NOAI">NOAI</option><option value="BOOTCAMP">Bootcamp</option>
        </select></label>
      </div>
      <p class="admin-msg form-error" id="adminCertificatesMessage" role="status"></p>
      <div class="admin-table-wrap">
        <table class="admin-table admin-table--certificates">
          <thead><tr><th>Participant</th><th>Contact</th><th>Attestations</th><th>Demandes</th><th>Téléch.</th><th>Dernière activité</th></tr></thead>
          <tbody id="adminCertificatesRows">${rowsHtml(data.participants || [])}</tbody>
        </table>
      </div>
      <nav class="admin-webinars-pager" aria-label="Pagination des attestations">
        <p class="admin-webinars-pager-meta" id="adminCertificatesPagerMeta">Page ${data.page || 1} sur ${data.totalPages || 1} · ${data.total || 0} participant(s)</p>
        <div class="admin-webinars-pager-btns"><button class="btn btn-secondary btn-sm" id="adminCertificatesPrev" ${(data.page || 1) <= 1 ? 'disabled' : ''}>Précédent</button><button class="btn btn-secondary btn-sm" id="adminCertificatesNext" ${(data.page || 1) >= (data.totalPages || 1) ? 'disabled' : ''}>Suivant</button></div>
      </nav>
    </section>`;
}

export async function renderAdminAttestationsHtml(user) {
  const data = await fetchAdminAttestations({ page: 1, pageSize: PAGE_SIZE });
  const inner = data.ok
    ? dashboardHtml(data)
    : `<header class="admin-page-head"><h1 class="h1">Attestations</h1></header><p class="admin-banner form-error">${esc(data.error || 'Chargement impossible')}</p>`;
  return wrapAdminPage('attestations', inner, user);
}

function csvCell(value) {
  let text = String(value ?? '');
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function bindAdminAttestationsPage() {
  const rows = document.getElementById('adminCertificatesRows');
  if (!rows) return;
  const search = document.getElementById('adminCertificatesSearch');
  const status = document.getElementById('adminCertificatesStatus');
  const kind = document.getElementById('adminCertificatesKind');
  const previous = document.getElementById('adminCertificatesPrev');
  const next = document.getElementById('adminCertificatesNext');
  const pager = document.getElementById('adminCertificatesPagerMeta');
  const message = document.getElementById('adminCertificatesMessage');
  let page = 1;
  let totalPages = 1;
  let debounce;

  async function load(targetPage = 1) {
    const result = await fetchAdminAttestations({
      page: targetPage,
      pageSize: PAGE_SIZE,
      q: search.value.trim(),
      status: status.value,
      kind: kind.value,
    });
    if (!result.ok) {
      message.textContent = result.error || 'Chargement impossible.';
      return;
    }
    message.textContent = '';
    page = result.page;
    totalPages = result.totalPages;
    rows.innerHTML = rowsHtml(result.participants);
    pager.textContent = `Page ${page} sur ${totalPages} · ${result.total} participant(s)`;
    previous.disabled = page <= 1;
    next.disabled = page >= totalPages;
  }

  search.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => load(1), 260);
  });
  status.addEventListener('change', () => load(1));
  kind.addEventListener('change', () => load(1));
  previous.addEventListener('click', () => load(Math.max(1, page - 1)));
  next.addEventListener('click', () => load(Math.min(totalPages, page + 1)));

  document.getElementById('adminCertificatesExport')?.addEventListener('click', async () => {
    const result = await fetchAdminAttestations({ page: 1, pageSize: 200, q: search.value.trim(), status: status.value, kind: kind.value });
    if (!result.ok) {
      message.textContent = result.error || 'Export impossible.';
      return;
    }
    const header = ['Numéro de table', 'Nom', 'Prénoms', 'E-mail', 'Téléphone', 'Demandes', 'Téléchargements', 'Dernière demande'];
    const lines = result.participants.map((participant) => [
      participant.tableNumber,
      participant.lastName,
      participant.firstName,
      participant.email || '',
      participant.phone || '',
      participant.requestCount,
      participant.certificates.reduce((sum, certificate) => sum + certificate.downloadCount, 0),
      participant.lastRequestAt || '',
    ]);
    const csv = `\uFEFF${[header, ...lines].map((line) => line.map(csvCell).join(';')).join('\n')}`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'attestations-la-forge-hub.csv';
    link.click();
    URL.revokeObjectURL(url);
  });
}
