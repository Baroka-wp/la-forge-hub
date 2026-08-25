/**
 * EMONOS — écran « Tasks management ».
 *
 * Reprend la maquette : colonne de jours à gauche, tâches empilées à droite,
 * fil d'Ariane « Sub Task of : /… », pagination, boutons latéraux (ajout,
 * filtre critique, filtre arrêtée, bascule archives) et boutons par tâche.
 */
import { emonos } from './api.js';
import { currentProject, state } from './state.js';
import {
  MACRO_LABELS,
  PRIORITY_LABELS,
  STATE_LABELS,
  chip,
  closeModal,
  dateInputValue,
  emptyState,
  escapeHtml,
  flash,
  formatDate,
  formatDayChip,
  modalError,
  openModal,
  optionList,
  priorityChip,
  readForm,
  stateChip,
} from './ui.js';

const MACRO_OPTIONS = {
  event_dashboard: ['sprint_dashboard', 'budget_dashboard', 'tender_dashboard'],
  event_configure: ['configure_repository', 'configure_ci', 'configure_review_board'],
};

export async function loadTasks() {
  const project = currentProject();
  if (!project) {
    state.view = { needsProject: true };
    return;
  }
  const result = await emonos.listTasks({
    projectId: project.id,
    parentId: state.parentTaskId || 'root',
    archived: state.filters.archived ? '1' : '0',
    critical: state.filters.critical ? '1' : '0',
    stopped: state.filters.stopped ? '1' : '0',
    before: state.filters.before ? `${state.filters.before}T23:59:59.000Z` : '',
    page: state.filters.page,
    pageSize: 20,
  });
  state.view = result.ok ? result.body : { error: result.error };
}

export function renderTasks() {
  if (state.view.needsProject) {
    return emptyState('Choisissez un projet', 'La barre d’outils permet de sélectionner le projet à piloter.');
  }
  if (state.view.error) return emptyState('Chargement impossible', state.view.error);
  const { days = [], breadcrumb, page, pageCount, total } = state.view;
  const project = currentProject();

  return `
    <div class="emonos-tasks">
      <div class="emonos-tasks-head">
        <p class="emonos-tasks-scope">
          ${state.filters.before
            ? `Tâches avant le <strong>${formatDate(`${state.filters.before}T00:00:00.000Z`)}</strong>`
            : 'Toutes les tâches'} pour le projet <strong>${escapeHtml(project.name)}</strong>
        </p>
        <p class="emonos-breadcrumb">
          ${breadcrumb
            ? `<button type="button" class="emonos-crumb-up" data-action="task-up" data-id="${breadcrumb.parentId || ''}">↑</button>
               Sous-tâche de : <code>${escapeHtml(breadcrumb.path)}</code>`
            : '<span class="emonos-crumb-root">Racine du projet</span>'}
        </p>
      </div>

      ${days.length ? days.map(renderDay).join('') : emptyState('Aucune tâche', 'Le bouton + ajoute une tâche à ce niveau.')}

      <footer class="emonos-pagination">
        <button type="button" class="emonos-icon-btn" data-action="task-page" data-page="${Math.max(1, page - 1)}" ${page <= 1 ? 'disabled' : ''}>‹</button>
        <span>${page} / ${pageCount} — ${total} tâche${total > 1 ? 's' : ''}</span>
        <button type="button" class="emonos-icon-btn" data-action="task-page" data-page="${Math.min(pageCount, page + 1)}" ${page >= pageCount ? 'disabled' : ''}>›</button>
      </footer>
    </div>`;
}

function renderDay(bucket) {
  const { day, month } = formatDayChip(bucket.day);
  return `
    <section class="emonos-day">
      <div class="emonos-day-chip"><strong>${escapeHtml(day)}</strong><span>${escapeHtml(month)}</span></div>
      <div class="emonos-day-tasks">${bucket.tasks.map(renderTaskRow).join('')}</div>
    </section>`;
}

function renderTaskRow(task) {
  const overdue = task.dueDate && new Date(task.dueDate) < new Date() && !['DONE', 'CANCELLED'].includes(task.state);
  return `
    <article class="emonos-task${overdue ? ' is-overdue' : ''}" data-task="${task.id}">
      <header class="emonos-task-head">
        <h3>${escapeHtml(task.title)}</h3>
        <div class="emonos-task-chips">
          ${priorityChip(task.priority)}
          ${stateChip(task.state)}
          ${task.childCount ? chip(`${task.childCount} sous-tâches`) : ''}
          ${task.archived ? chip('Archivée', 'muted') : ''}
        </div>
      </header>
      ${task.description ? `<p class="emonos-task-desc">${escapeHtml(task.description)}</p>` : ''}
      <p class="emonos-task-meta">
        <span>${escapeHtml(task.owner?.displayName || 'Sans responsable')}</span>
        <span>${formatDate(task.startDate)} → ${formatDate(task.dueDate)}</span>
        ${task.plannedHours ? `<span>${task.plannedHours} h planifiées</span>` : ''}
        <span>${task.progress}%</span>
      </p>
      <footer class="emonos-task-actions">
        <button type="button" class="emonos-btn is-ghost" data-action="task-edit" data-id="${task.id}">Éditer</button>
        <button type="button" class="emonos-btn is-ghost" data-action="task-open" data-id="${task.id}">Ouvrir</button>
        ${task.eventDashboard
          ? `<button type="button" class="emonos-btn is-accent" data-action="task-dashboard" data-id="${task.id}" title="${escapeHtml(MACRO_LABELS[task.eventDashboard] || task.eventDashboard)}">Dashboard</button>`
          : ''}
        ${task.eventConfigure
          ? `<button type="button" class="emonos-btn is-accent" data-action="task-configure" data-id="${task.id}" title="${escapeHtml(MACRO_LABELS[task.eventConfigure] || task.eventConfigure)}">Configurer</button>`
          : ''}
        <button type="button" class="emonos-btn is-ghost" data-action="task-archive" data-id="${task.id}">
          ${task.archived ? 'Désarchiver' : 'Archiver'}
        </button>
        <button type="button" class="emonos-btn is-danger" data-action="task-delete" data-id="${task.id}">Supprimer</button>
      </footer>
    </article>`;
}

/* ---------- Formulaire de tâche ---------- */

export function openTaskEditor(task, { projectId, parentId, members }) {
  const isNew = !task;
  const owners = (members || [])
    .map((m) => `<option value="${m.user.id}"${m.user.id === task?.owner?.id ? ' selected' : ''}>${escapeHtml(m.user.displayName)}</option>`)
    .join('');
  const macroSelect = (name, options, selected) => `
    <select name="${name}">
      <option value="">Aucune</option>
      ${options
        .map((macro) => `<option value="${macro}"${macro === selected ? ' selected' : ''}>${escapeHtml(MACRO_LABELS[macro] || macro)}</option>`)
        .join('')}
    </select>`;

  openModal(isNew ? 'Nouvelle tâche' : `Éditer « ${task.title} »`, `
    <form class="emonos-form" data-task-form="${task?.id || ''}" data-project="${projectId}" data-parent="${parentId || ''}">
      <label class="emonos-field">
        <span>Titre <em>*</em></span>
        <input name="title" required maxlength="200" value="${escapeHtml(task?.title || '')}" placeholder="Intitulé de la tâche" />
      </label>
      <label class="emonos-field">
        <span>Description</span>
        <textarea name="description" rows="3">${escapeHtml(task?.description || '')}</textarea>
      </label>
      <div class="emonos-field-row">
        <label class="emonos-field"><span>Priorité</span><select name="priority">${optionList(PRIORITY_LABELS, task?.priority || 'NORMAL')}</select></label>
        <label class="emonos-field"><span>État</span><select name="state">${optionList(STATE_LABELS, task?.state || 'TODO')}</select></label>
      </div>
      <div class="emonos-field-row">
        <label class="emonos-field"><span>Début</span><input type="date" name="startDate" value="${dateInputValue(task?.startDate)}" /></label>
        <label class="emonos-field"><span>Échéance</span><input type="date" name="dueDate" value="${dateInputValue(task?.dueDate)}" /></label>
      </div>
      <div class="emonos-field-row">
        <label class="emonos-field"><span>Charge (h)</span><input type="number" min="0" name="plannedHours" value="${task?.plannedHours ?? ''}" /></label>
        <label class="emonos-field"><span>Avancement (%)</span><input type="number" min="0" max="100" name="progress" value="${task?.progress ?? 0}" /></label>
      </div>
      <label class="emonos-field">
        <span>Responsable</span>
        <select name="ownerId"><option value="">Aucun</option>${owners}</select>
      </label>
      <fieldset class="emonos-fieldset">
        <legend>Actions personnalisées</legend>
        <p class="emonos-form-hint">Les boutons DASHBOARD et CONFIGURE n’apparaissent sur la tâche que si une macro est attachée.</p>
        <div class="emonos-field-row">
          <label class="emonos-field"><span>event_dashboard</span>${macroSelect('eventDashboard', MACRO_OPTIONS.event_dashboard, task?.eventDashboard)}</label>
          <label class="emonos-field"><span>event_configure</span>${macroSelect('eventConfigure', MACRO_OPTIONS.event_configure, task?.eventConfigure)}</label>
        </div>
      </fieldset>
      <footer class="emonos-form-actions">
        <button type="button" class="emonos-btn is-ghost" data-modal-close>Annuler</button>
        <button type="submit" class="emonos-btn is-primary">${isNew ? 'Créer la tâche' : 'Enregistrer'}</button>
      </footer>
    </form>`, { size: 'lg' });
}

export async function submitTaskForm(form) {
  const data = readForm(form);
  const payload = {
    title: data.title,
    description: data.description,
    priority: data.priority,
    state: data.state,
    startDate: data.startDate ? `${data.startDate}T00:00:00.000Z` : null,
    dueDate: data.dueDate ? `${data.dueDate}T00:00:00.000Z` : null,
    plannedHours: data.plannedHours === null ? null : Number(data.plannedHours),
    progress: data.progress === null ? 0 : Number(data.progress),
    ownerId: data.ownerId,
    eventDashboard: data.eventDashboard,
    eventConfigure: data.eventConfigure,
  };
  const taskId = form.dataset.taskForm;
  const result = taskId
    ? await emonos.patchTask(taskId, payload)
    : await emonos.createTask({ ...payload, projectId: form.dataset.project, parentId: form.dataset.parent || null });
  if (!result.ok) {
    modalError(result.error);
    return false;
  }
  closeModal();
  flash(taskId ? 'Tâche mise à jour.' : 'Tâche créée.', 'success');
  return true;
}

/* ---------- Macros ---------- */

export function renderDashboardMacro(payload) {
  const { dashboard, macro } = payload;
  const rows = (entries, labels) =>
    Object.entries(entries || {})
      .map(([key, count]) => `<div class="emonos-stat"><strong>${count}</strong><span>${escapeHtml(labels[key] || key)}</span></div>`)
      .join('') || '<p class="emonos-empty-hint">Aucune donnée.</p>';

  openModal(MACRO_LABELS[macro] || macro, `
    <div class="emonos-dashboard">
      <p class="emonos-form-lead">${escapeHtml(dashboard.title)}</p>
      <div class="emonos-stat-row">
        <div class="emonos-stat"><strong>${dashboard.total}</strong><span>tâches</span></div>
        <div class="emonos-stat"><strong>${dashboard.plannedHours}</strong><span>heures</span></div>
        <div class="emonos-stat"><strong>${dashboard.averageProgress}%</strong><span>avancement</span></div>
        <div class="emonos-stat${dashboard.overdue ? ' is-alert' : ''}"><strong>${dashboard.overdue}</strong><span>en retard</span></div>
      </div>
      <h3 class="emonos-subtitle">Par état</h3>
      <div class="emonos-stat-row">${rows(dashboard.byState, STATE_LABELS)}</div>
      <h3 class="emonos-subtitle">Par priorité</h3>
      <div class="emonos-stat-row">${rows(dashboard.byPriority, PRIORITY_LABELS)}</div>
      ${dashboard.nextMilestone
        ? `<p class="emonos-form-hint">Prochaine échéance : <strong>${escapeHtml(dashboard.nextMilestone.title)}</strong> le ${formatDate(dashboard.nextMilestone.dueDate)}.</p>`
        : ''}
      ${dashboard.daysToDue !== null
        ? `<p class="emonos-form-hint">${dashboard.daysToDue >= 0 ? `${dashboard.daysToDue} jours restants` : `${Math.abs(dashboard.daysToDue)} jours de retard`} sur cette branche.</p>`
        : ''}
      <footer class="emonos-form-actions"><button type="button" class="emonos-btn is-primary" data-modal-close>Fermer</button></footer>
    </div>`, { size: 'lg' });
}
