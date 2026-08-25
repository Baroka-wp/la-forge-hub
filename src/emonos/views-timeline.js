/**
 * EMONOS — vue « Project Timeline » : diagramme de Gantt rendu en HTML/CSS,
 * sans dépendance externe (le deck cite dhtmlxGantt comme référence visuelle).
 */
import { emonos } from './api.js';
import { currentProject, state } from './state.js';
import { PRIORITY_LABELS, STATE_LABELS, emptyState, escapeHtml, formatDate } from './ui.js';

const DAY_MS = 86_400_000;

export async function loadTimeline() {
  const project = currentProject();
  if (!project) {
    state.view = { needsProject: true };
    return;
  }
  const result = await emonos.timeline(project.id);
  state.view = result.ok ? result.body : { error: result.error };
}

export function renderTimeline() {
  if (state.view.needsProject) {
    return emptyState('Choisissez un projet', 'La timeline affiche les tâches datées du projet sélectionné.');
  }
  if (state.view.error) return emptyState('Chargement impossible', state.view.error);

  const { project, window: bounds, tasks = [] } = state.view;
  const dated = treeOrder(tasks).filter((task) => task.startDate && task.dueDate);
  if (!dated.length) {
    return emptyState('Aucune tâche datée', 'Ajoutez des dates aux tâches pour alimenter le diagramme.');
  }

  const start = new Date(bounds.start || dated[0].startDate);
  const end = new Date(bounds.end || dated[dated.length - 1].dueDate);
  const span = Math.max(1, Math.round((end - start) / DAY_MS));
  const months = monthTicks(start, end, span);

  return `
    <div class="emonos-timeline">
      <header class="emonos-timeline-head">
        <h2>${escapeHtml(project.name)}</h2>
        <p class="emonos-card-sub">${formatDate(project.startDate)} → ${formatDate(project.dueDate)} · ${span} jours · ${dated.length} tâches datées</p>
      </header>
      <div class="emonos-gantt" role="table" aria-label="Diagramme de Gantt du projet">
        <div class="emonos-gantt-scroll">
          <div class="emonos-gantt-axis" aria-hidden="true">
            ${months.map((tick) => `<span style="left:${tick.left}%">${escapeHtml(tick.label)}</span>`).join('')}
          </div>
          ${dated.map((task) => renderRow(task, start, span)).join('')}
        </div>
      </div>
    </div>`;
}

/** Remet les tâches dans l'ordre de l'arborescence : un parent puis ses enfants. */
function treeOrder(tasks) {
  const byParent = new Map();
  tasks.forEach((task) => {
    const key = task.parentId || 'root';
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(task);
  });
  const walk = (key) => (byParent.get(key) || []).flatMap((task) => [task, ...walk(task.id)]);
  return walk('root');
}

function renderRow(task, start, span) {
  const from = Math.max(0, (new Date(task.startDate) - start) / DAY_MS);
  const to = Math.max(from + 1, (new Date(task.dueDate) - start) / DAY_MS);
  const left = (from / span) * 100;
  const width = Math.max(1.2, ((to - from) / span) * 100);
  const depth = Math.max(0, task.path.split('/').filter(Boolean).length);
  const title = `${task.title} — ${PRIORITY_LABELS[task.priority] || task.priority} · ${STATE_LABELS[task.state] || task.state} · ${formatDate(task.startDate)} → ${formatDate(task.dueDate)}`;
  return `
    <div class="emonos-gantt-row" role="row">
      <div class="emonos-gantt-label" role="rowheader" style="--depth:${depth}" title="${escapeHtml(task.path)}">
        ${escapeHtml(task.title)}
      </div>
      <div class="emonos-gantt-track" role="cell">
        <div class="emonos-gantt-bar is-${task.state.toLowerCase()} is-priority-${task.priority.toLowerCase()}"
             style="left:${left.toFixed(2)}%;width:${width.toFixed(2)}%"
             title="${escapeHtml(title)}">
          <span class="emonos-gantt-progress" style="width:${Math.min(100, task.progress)}%"></span>
        </div>
      </div>
    </div>`;
}

/** Graduations mensuelles, positionnées en pourcentage de la fenêtre. */
function monthTicks(start, end, span) {
  const ticks = [];
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const formatter = new Intl.DateTimeFormat('fr-FR', { month: 'short', year: '2-digit', timeZone: 'UTC' });
  while (cursor <= end && ticks.length < 60) {
    const offset = (cursor - start) / DAY_MS;
    if (offset >= 0) ticks.push({ left: Math.min(99, (offset / span) * 100), label: formatter.format(cursor) });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return ticks;
}
