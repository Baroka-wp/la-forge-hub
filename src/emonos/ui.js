/**
 * EMONOS — libellés, formatage et fragments d'interface partagés.
 */

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const PRIORITY_LABELS = {
  LOW: 'Basse',
  NORMAL: 'Normale',
  HIGH: 'Haute',
  CRITICAL: 'Critique',
};

export const STATE_LABELS = {
  TODO: 'À faire',
  RUNNING: 'En cours',
  STOPPED: 'Arrêtée',
  DONE: 'Terminée',
  CANCELLED: 'Annulée',
};

export const STAGE_LABELS = {
  PRESALE: 'Avant-vente',
  EVALUATION: 'Évaluation',
  DEVELOPMENT: 'Développement',
  DELIVERY: 'Livraison',
  CLOSED: 'Clôturé',
};

export const KIND_LABELS = {
  SOFTWARE_DEV: 'Développement logiciel',
  CALL_FOR_TENDER: 'Appel d’offres',
  COMPANY_MGMT: 'Gestion d’entreprise',
};

export const DATE_MODE_LABELS = {
  NONE: 'Sans date',
  FIXED: 'Début et échéance',
  AUTOMATIC: 'Automatique',
};

export const ROLE_LABELS = {
  OWNER: 'Responsable',
  MANAGER: 'Gestionnaire',
  MEMBER: 'Membre',
  VIEWER: 'Lecteur',
};

export const NODE_KIND_LABELS = {
  START: 'Départ',
  STEP: 'Étape',
  DECISION: 'Décision',
  SUBTASK: 'Sous-tâche',
  END: 'Fin',
};

export const MACRO_LABELS = {
  sprint_dashboard: 'Tableau de bord sprint',
  budget_dashboard: 'Tableau de bord budget',
  tender_dashboard: 'Tableau de bord appel d’offres',
  configure_repository: 'Configurer le dépôt',
  configure_ci: 'Configurer l’intégration continue',
  configure_review_board: 'Configurer le comité de revue',
};

const DATE_FORMAT = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'Europe/Paris',
});

const DAY_FORMAT = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', timeZone: 'Europe/Paris' });
const MONTH_FORMAT = new Intl.DateTimeFormat('fr-FR', { month: 'long', timeZone: 'Europe/Paris' });

export function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : DATE_FORMAT.format(date);
}

/** Pastille de jour de l'écran « Tasks management » : « 30 / juin ». */
export function formatDayChip(value) {
  if (!value) return { day: '··', month: 'sans date' };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { day: '··', month: 'sans date' };
  return { day: DAY_FORMAT.format(date), month: MONTH_FORMAT.format(date) };
}

/** Valeur d'un `<input type="date">` à partir d'une date ISO. */
export function dateInputValue(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

export function chip(label, variant = '') {
  return `<span class="emonos-chip${variant ? ` is-${variant}` : ''}">${escapeHtml(label)}</span>`;
}

export function priorityChip(priority) {
  return `<span class="emonos-chip is-priority-${priority.toLowerCase()}">${escapeHtml(PRIORITY_LABELS[priority] || priority)}</span>`;
}

export function stateChip(state) {
  return `<span class="emonos-chip is-state-${state.toLowerCase()}">${escapeHtml(STATE_LABELS[state] || state)}</span>`;
}

export function emptyState(title, hint) {
  return `<div class="emonos-empty"><p class="emonos-empty-title">${escapeHtml(title)}</p>${
    hint ? `<p class="emonos-empty-hint">${escapeHtml(hint)}</p>` : ''
  }</div>`;
}

export function optionList(entries, selected) {
  return Object.entries(entries)
    .map(([value, label]) => `<option value="${escapeHtml(value)}"${value === selected ? ' selected' : ''}>${escapeHtml(label)}</option>`)
    .join('');
}

/** Bandeau de message éphémère en haut de l'espace de travail. */
export function flash(message, tone = 'info') {
  const host = document.getElementById('emonosFlash');
  if (!host) return;
  host.className = `emonos-flash is-${tone}`;
  host.textContent = message;
  host.hidden = false;
  clearTimeout(flash._timer);
  flash._timer = setTimeout(() => {
    host.hidden = true;
  }, 4_000);
}

/** Boîte de dialogue interne (assistants, formulaires, tableaux de bord). */
export function openModal(title, bodyHtml, { size = 'md' } = {}) {
  const host = document.getElementById('emonosModal');
  if (!host) return;
  host.innerHTML = `
    <div class="emonos-modal-backdrop" data-modal-close></div>
    <div class="emonos-modal-card is-${size}" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
      <header class="emonos-modal-head">
        <h2>${escapeHtml(title)}</h2>
        <button type="button" class="emonos-icon-btn" data-modal-close aria-label="Fermer">✕</button>
      </header>
      <div class="emonos-modal-body">${bodyHtml}</div>
    </div>`;
  host.hidden = false;
  host.querySelector('input, select, textarea, button')?.focus();
}

export function closeModal() {
  const host = document.getElementById('emonosModal');
  if (!host) return;
  host.hidden = true;
  host.innerHTML = '';
}

export function modalError(message) {
  const host = document.querySelector('#emonosModal .emonos-modal-body');
  if (!host) return;
  let box = host.querySelector('.emonos-form-error');
  if (!box) {
    box = document.createElement('p');
    box.className = 'emonos-form-error';
    host.prepend(box);
  }
  box.textContent = message;
}

/** Lit un formulaire en convertissant les chaînes vides en `null`. */
export function readForm(form) {
  const data = {};
  new FormData(form).forEach((value, key) => {
    data[key] = typeof value === 'string' && value.trim() === '' ? null : value;
  });
  return data;
}
