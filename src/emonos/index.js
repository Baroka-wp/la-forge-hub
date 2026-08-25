/**
 * EMONOS — Task Automation.
 *
 * Espace de travail plein écran monté sous `/emonos`, d'après la présentation
 * « Task Manager : EMONOS ». Le rail de gauche porte les sections, la barre
 * d'outils le projet courant et les filtres, la colonne de droite les boutons
 * latéraux (ajout, tâches critiques, tâches arrêtées, bascule archives).
 */
import { emonos, hasSession } from './api.js';
import {
  SECTIONS,
  currentProject,
  readStoredProject,
  resetTaskFilters,
  state,
  storeProject,
} from './state.js';
import {
  KIND_LABELS,
  PRIORITY_LABELS,
  STAGE_LABELS,
  closeModal,
  escapeHtml,
  flash,
  openModal,
  optionList,
  readForm,
} from './ui.js';
import {
  loadProjectDetail,
  loadProjects,
  openMemberPicker,
  openProjectEditor,
  openWizard,
  renderProjectDetail,
  renderProjects,
  submitProjectForm,
  submitWizard,
  wizardBack,
} from './views-projects.js';
import {
  loadTasks,
  openTaskEditor,
  renderDashboardMacro,
  renderTasks,
  submitTaskForm,
} from './views-tasks.js';
import {
  addNode,
  applyNodeForm,
  designer,
  dropNode,
  dropTransition,
  loadWorkflows,
  moveNode,
  openNodeEditor,
  openWorkflowCreator,
  renderWorkflows,
  saveDesigner,
  setTransitionLabel,
  submitWorkflowForm,
  toggleLink,
} from './views-workflow.js';
import { loadTimeline, renderTimeline } from './views-timeline.js';
import {
  loadConfig,
  loadTeams,
  loadTemplates,
  openDocumentEditor,
  openTeamEditor,
  openTeamMemberPicker,
  openTemplateEditor,
  renderConfig,
  renderTeams,
  renderTemplates,
  submitDocumentForm,
  submitTeamForm,
  submitTemplateForm,
} from './views-library.js';

const SECTION_BY_PATH = new Map(SECTIONS.map((section) => [section.path, section.key]));

/** @param {string} pathname */
export function matchEmonosSection(pathname) {
  const clean = pathname.replace(/\/$/, '') || '/emonos';
  return SECTION_BY_PATH.get(clean) || (clean === '/emonos' ? 'projects' : null);
}

/** Page complète (hors coquille marketing), rendue par le routeur de `src/app.js`. */
export function renderEmonosPageHtml(section) {
  state.section = section || 'projects';
  return `
    <div class="emonos-app" id="emonosApp">
      <aside class="emonos-rail">
        <div class="emonos-brand">
          <span class="emonos-brand-mark">E</span>
          <span class="emonos-brand-text"><strong>EMONOS</strong><em>Task Automation</em></span>
        </div>
        <nav class="emonos-rail-nav" aria-label="Sections EMONOS">
          ${SECTIONS.map(
            (item) => `
            <a data-router href="${item.path}" class="emonos-rail-link${item.key === state.section ? ' is-active' : ''}">
              <span aria-hidden="true">${item.icon}</span>${escapeHtml(item.label)}
            </a>`,
          ).join('')}
        </nav>
        <a data-router href="/dashboard" class="emonos-rail-back">← La Forge Hub</a>
      </aside>

      <div class="emonos-main">
        <header class="emonos-topbar" id="emonosTopbar"></header>
        <p class="emonos-flash" id="emonosFlash" hidden></p>
        <div class="emonos-workspace" id="emonosWorkspace">
          <div class="emonos-loading">Chargement de l’espace EMONOS…</div>
        </div>
      </div>

      <aside class="emonos-side-buttons" id="emonosSideButtons"></aside>
      <div class="emonos-modal" id="emonosModal" hidden></div>
    </div>`;
}

/* ---------- Cycle de vie ---------- */

export async function bindEmonosPage(section, { navigate }) {
  state.section = section;
  bindEvents(navigate);
  if (!hasSession()) {
    renderWorkspace('<div class="emonos-empty"><p class="emonos-empty-title">Session requise</p><p class="emonos-empty-hint">Connectez-vous pour accéder à EMONOS.</p><p><a data-router class="emonos-btn is-primary" href="/login">Se connecter</a></p></div>');
    return;
  }
  if (!state.ready) {
    const result = await emonos.bootstrap();
    if (!result.ok) {
      renderWorkspace(`<div class="emonos-empty"><p class="emonos-empty-title">Espace indisponible</p><p class="emonos-empty-hint">${escapeHtml(result.error)}</p></div>`);
      return;
    }
    Object.assign(state, {
      ready: true,
      user: result.body.user,
      blueprints: result.body.blueprints,
      teams: result.body.teams,
      projects: result.body.projects,
      templates: result.body.templates,
      workflows: result.body.workflows,
    });
    const stored = readStoredProject();
    if (stored && state.projects.some((p) => p.id === stored)) state.projectId = stored;
  }
  await refresh();
}

async function refresh() {
  const loaders = {
    projects: loadProjects,
    tasks: loadTasks,
    timeline: loadTimeline,
    documents: loadTemplates,
    teams: loadTeams,
    workflows: loadWorkflows,
    config: loadConfig,
  };
  await loaders[state.section]();
  renderTopbar();
  renderSideButtons();
  renderWorkspace(renderSection());
}

function renderSection() {
  if (state.section === 'projects') {
    return state.view.detail ? renderProjectDetail(state.view.detail) : renderProjects();
  }
  const renderers = {
    tasks: renderTasks,
    timeline: renderTimeline,
    documents: renderTemplates,
    teams: renderTeams,
    workflows: renderWorkflows,
    config: renderConfig,
  };
  return renderers[state.section]();
}

function renderWorkspace(html) {
  const host = document.getElementById('emonosWorkspace');
  if (host) host.innerHTML = html;
}

/* ---------- Barre d'outils ---------- */

function renderTopbar() {
  const host = document.getElementById('emonosTopbar');
  if (!host) return;
  const project = currentProject();
  const projectOptions = state.projects
    .filter((p) => !p.archived || p.id === state.projectId)
    .map((p) => `<option value="${p.id}"${p.id === state.projectId ? ' selected' : ''}>${escapeHtml(p.name)}</option>`)
    .join('');

  host.innerHTML = `
    <div class="emonos-topbar-left">
      <label class="emonos-select">
        <span>Projet</span>
        <select id="emonosProjectSelect">
          <option value="">Tous</option>
          ${projectOptions}
        </select>
      </label>
      ${state.section === 'projects'
        ? `<label class="emonos-select">
             <span>Grouper par</span>
             <select id="emonosGroupBy">${optionList({ priority: 'Priorité', owner: 'Responsable', stage: 'Étape' }, state.filters.groupBy)}</select>
           </label>
           <label class="emonos-select">
             <span>Portée</span>
             <select id="emonosScope">${optionList({ all: 'Tous les projets', mine: 'Mes projets' }, state.filters.scope)}</select>
           </label>`
        : ''}
      ${state.section === 'tasks'
        ? `<label class="emonos-select">
             <span>Tâches avant le</span>
             <input type="date" id="emonosBefore" value="${escapeHtml(state.filters.before)}" />
           </label>`
        : ''}
      ${state.section === 'workflows'
        ? `<label class="emonos-select">
             <span>Workflow</span>
             <select id="emonosWorkflowSelect">
               ${state.workflows.map((w) => `<option value="${w.id}"${w.id === state.workflowId ? ' selected' : ''}>${escapeHtml(w.name)}</option>`).join('')}
             </select>
           </label>
           <button type="button" class="emonos-btn is-ghost" data-action="new-workflow">Nouveau workflow</button>`
        : ''}
    </div>
    <div class="emonos-topbar-right">
      ${project
        ? `<span class="emonos-topbar-tag">${escapeHtml(KIND_LABELS[project.kind] || project.kind)} · ${escapeHtml(STAGE_LABELS[project.stage])} · ${escapeHtml(PRIORITY_LABELS[project.priority])}</span>`
        : ''}
      <span class="emonos-topbar-tz">Europe/Paris</span>
      <span class="emonos-topbar-user">${escapeHtml(state.user?.displayName || '')}</span>
    </div>`;
}

/** Boutons latéraux du deck : ajouter, filtrer critiques, filtrer arrêtées, archives. */
function renderSideButtons() {
  const host = document.getElementById('emonosSideButtons');
  if (!host) return;
  const showTaskFilters = state.section === 'tasks';
  host.innerHTML = `
    <button type="button" class="emonos-side-btn is-add" data-action="side-add" title="Ajouter">+</button>
    ${showTaskFilters
      ? `<button type="button" class="emonos-side-btn${state.filters.critical ? ' is-on' : ''}" data-action="side-critical" title="Tâches critiques">!</button>
         <button type="button" class="emonos-side-btn${state.filters.stopped ? ' is-on' : ''}" data-action="side-stopped" title="Tâches arrêtées">◼</button>`
      : ''}
    ${state.section === 'tasks' || state.section === 'projects'
      ? `<button type="button" class="emonos-side-btn${state.filters.archived ? ' is-on' : ''}" data-action="side-archived" title="Archives">⤓</button>`
      : ''}`;
}

/* ---------- Événements ---------- */

let bound = false;

function bindEvents(navigate) {
  if (bound) return;
  bound = true;

  document.addEventListener('click', (event) => {
    if (!document.getElementById('emonosApp')) return;
    if (event.target.closest('[data-modal-close]')) {
      closeModal();
      return;
    }
    const trigger = event.target.closest('[data-action]');
    if (!trigger) return;
    const action = trigger.dataset.action;
    const id = trigger.dataset.id;
    event.preventDefault();
    handleAction(action, id, trigger, navigate).catch((error) => {
      console.error('[emonos]', error);
      flash('Action impossible', 'error');
    });
  });

  document.addEventListener('submit', (event) => {
    if (!document.getElementById('emonosApp')) return;
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    const handler = formHandler(form);
    if (!handler) return;
    event.preventDefault();
    handler(form)
      .then((result) => {
        if (result === false) return;
        if (result && typeof result === 'object' && result.created) {
          selectProject(result.created.id);
        }
        return refresh();
      })
      .catch((error) => {
        console.error('[emonos]', error);
        flash('Enregistrement impossible', 'error');
      });
  });

  document.addEventListener('change', (event) => {
    if (!document.getElementById('emonosApp')) return;
    const target = event.target;
    if (target.id === 'emonosProjectSelect') {
      selectProject(target.value || null);
      refresh();
    } else if (target.id === 'emonosGroupBy') {
      state.filters.groupBy = target.value;
      refresh();
    } else if (target.id === 'emonosScope') {
      state.filters.scope = target.value;
      refresh();
    } else if (target.id === 'emonosBefore') {
      state.filters.before = target.value;
      state.filters.page = 1;
      refresh();
    } else if (target.id === 'emonosWorkflowSelect') {
      state.workflowId = target.value;
      refresh();
    }
  });

  document.addEventListener('input', (event) => {
    const target = event.target;
    if (target.dataset?.action === 'wf-label') {
      setTransitionLabel(Number(target.dataset.index), target.value);
      const save = document.querySelector('[data-action="wf-save"]');
      if (save) save.disabled = false;
    }
  });

  bindNodeDragging();
}

function formHandler(form) {
  if (form.dataset.wizardStep) return submitWizard;
  if (form.dataset.projectForm) return submitProjectForm;
  if (form.dataset.taskForm !== undefined && form.dataset.project) return submitTaskForm;
  if (form.dataset.templateForm !== undefined && !form.dataset.documentForm) return submitTemplateForm;
  if (form.dataset.documentForm) return submitDocumentForm;
  if (form.dataset.teamForm !== undefined && !form.dataset.teamMemberForm) return submitTeamForm;
  if (form.dataset.teamMemberForm) return submitTeamMemberForm;
  if (form.dataset.memberForm) return submitProjectMemberForm;
  if (form.dataset.nodeForm) return async (el) => applyNodeForm(el);
  if (form.dataset.workflowForm) return submitWorkflowForm;
  return null;
}

async function submitTeamMemberForm(form) {
  const data = readForm(form);
  const result = await emonos.addTeamMember(form.dataset.teamMemberForm, { email: data.email, role: data.role });
  if (!result.ok) {
    flash(result.error, 'error');
    return false;
  }
  closeModal();
  flash('Membre ajouté.', 'success');
  return true;
}

async function submitProjectMemberForm(form) {
  const data = readForm(form);
  const result = await emonos.addProjectMember(form.dataset.memberForm, { email: data.email, role: data.role });
  if (!result.ok) {
    flash(result.error, 'error');
    return false;
  }
  closeModal();
  flash('Membre ajouté au projet.', 'success');
  return true;
}

function selectProject(projectId) {
  state.projectId = projectId;
  storeProject(projectId);
  resetTaskFilters();
  state.view = {};
}

/* eslint-disable complexity -- table d'aiguillage des actions de l'interface */
async function handleAction(action, id, trigger, navigate) {
  switch (action) {
    /* Boutons latéraux */
    case 'side-add':
      if (state.section === 'tasks') return openNewTask();
      if (state.section === 'teams') return openTeamEditor(null);
      if (state.section === 'documents') return openTemplateEditor(null);
      if (state.section === 'workflows') return openWorkflowCreator();
      return openWizard();
    case 'side-critical':
      state.filters.critical = !state.filters.critical;
      state.filters.page = 1;
      return refresh();
    case 'side-stopped':
      state.filters.stopped = !state.filters.stopped;
      state.filters.page = 1;
      return refresh();
    case 'side-archived':
      state.filters.archived = !state.filters.archived;
      state.filters.page = 1;
      return refresh();

    /* Assistant */
    case 'wizard-back':
      return wizardBack();

    /* Projets */
    case 'open-project': {
      selectProject(id);
      const detail = await loadProjectDetail(id);
      state.view = { detail };
      renderTopbar();
      renderSideButtons();
      return renderWorkspace(renderSection());
    }
    case 'project-tasks':
      selectProject(id);
      navigate('/emonos/tasks');
      return undefined;
    case 'edit-project':
      return openProjectEditor(state.projects.find((p) => p.id === id));
    case 'toggle-archive-project': {
      const project = state.projects.find((p) => p.id === id);
      const result = await emonos.patchProject(id, { archived: !project.archived });
      if (!result.ok) return flash(result.error, 'error');
      return refresh();
    }
    case 'delete-project': {
      if (!window.confirm('Supprimer ce projet, ses tâches et ses documents ?')) return undefined;
      const result = await emonos.deleteProject(id);
      if (!result.ok) return flash(result.error, 'error');
      if (state.projectId === id) selectProject(null);
      flash('Projet supprimé.', 'success');
      return refresh();
    }
    case 'add-project-member':
      return openMemberPicker(id);
    case 'remove-project-member': {
      const result = await emonos.removeProjectMember(id, trigger.dataset.user);
      if (!result.ok) return flash(result.error, 'error');
      state.view = { detail: await loadProjectDetail(id) };
      return renderWorkspace(renderSection());
    }

    /* Workflow d'un projet */
    case 'restart-run': {
      const result = await emonos.startRun(id, {});
      if (!result.ok) return flash(result.error, 'error');
      state.view = { detail: await loadProjectDetail(id) };
      flash('Workflow démarré.', 'success');
      return renderWorkspace(renderSection());
    }
    case 'advance-run': {
      const result = await emonos.advanceRun(id, { decision: trigger.dataset.decision || null });
      if (!result.ok) return flash(result.error, 'error');
      if (result.body.createdTask) flash(`Sous-tâche « ${result.body.createdTask.title} » instanciée.`, 'success');
      /** L'étape franchie peut changer l'étape du projet : on recharge la liste puis la fiche. */
      const projectId = state.projectId;
      await loadProjects();
      state.view = { detail: await loadProjectDetail(projectId) };
      renderTopbar();
      return renderWorkspace(renderSection());
    }
    case 'cancel-run': {
      const result = await emonos.cancelRun(id);
      if (!result.ok) return flash(result.error, 'error');
      state.view = { detail: await loadProjectDetail(state.projectId) };
      return renderWorkspace(renderSection());
    }

    /* Tâches */
    case 'task-open':
      state.parentTaskId = id;
      state.filters.page = 1;
      return refresh();
    case 'task-up':
      state.parentTaskId = id || null;
      state.filters.page = 1;
      return refresh();
    case 'task-page':
      state.filters.page = Number(trigger.dataset.page) || 1;
      return refresh();
    case 'task-edit': {
      const detail = await emonos.getTask(id);
      if (!detail.ok) return flash(detail.error, 'error');
      const members = await projectMembers();
      return openTaskEditor(detail.body.task, { projectId: state.projectId, members });
    }
    case 'task-archive': {
      const task = findTask(id);
      const result = await emonos.taskAction(id, task?.archived ? 'unarchive' : 'archive');
      if (!result.ok) return flash(result.error, 'error');
      return refresh();
    }
    case 'task-delete': {
      if (!window.confirm('Supprimer cette tâche et ses sous-tâches ?')) return undefined;
      const result = await emonos.deleteTask(id);
      if (!result.ok) return flash(result.error, 'error');
      flash('Tâche supprimée.', 'success');
      return refresh();
    }
    case 'task-dashboard': {
      const result = await emonos.taskAction(id, 'dashboard');
      if (!result.ok) return flash(result.error, 'error');
      return renderDashboardMacro(result.body);
    }
    case 'task-configure': {
      const result = await emonos.taskAction(id, 'configure');
      if (!result.ok) return flash(result.error, 'error');
      flash(
        result.body.created.length
          ? `${result.body.created.length} sous-tâches créées par la macro.`
          : 'La configuration est déjà en place.',
        'success',
      );
      return refresh();
    }

    /* Modèles et documents */
    case 'new-template':
      return openTemplateEditor(null);
    case 'edit-template': {
      const template = (state.view.templates || []).find((t) => t.id === id);
      return openTemplateEditor(template);
    }
    case 'delete-template': {
      if (!window.confirm('Supprimer ce modèle ?')) return undefined;
      const result = await emonos.deleteTemplate(id);
      if (!result.ok) return flash(result.error, 'error');
      return refresh();
    }
    case 'instantiate-template': {
      const result = await emonos.createDocument({ projectId: state.projectId, templateId: id });
      if (!result.ok) return flash(result.error, 'error');
      flash('Document instancié.', 'success');
      return refresh();
    }
    case 'new-document':
      return openDocumentPicker(id);
    case 'edit-document': {
      const result = await emonos.getDocument(id);
      if (!result.ok) return flash(result.error, 'error');
      return openDocumentEditor(result.body.document);
    }
    case 'delete-document': {
      if (!window.confirm('Supprimer ce document ?')) return undefined;
      const result = await emonos.deleteDocument(id);
      if (!result.ok) return flash(result.error, 'error');
      return refresh();
    }

    /* Équipes */
    case 'edit-team':
      return openTeamEditor((state.view.teams || []).find((t) => t.id === id));
    case 'delete-team': {
      if (!window.confirm('Supprimer cette équipe ?')) return undefined;
      const result = await emonos.deleteTeam(id);
      if (!result.ok) return flash(result.error, 'error');
      return refresh();
    }
    case 'add-team-member':
      return openTeamMemberPicker(id);
    case 'remove-team-member': {
      const result = await emonos.removeTeamMember(id, trigger.dataset.user);
      if (!result.ok) return flash(result.error, 'error');
      return refresh();
    }

    /* Concepteur de workflow */
    case 'new-workflow':
      return openWorkflowCreator();
    case 'open-workflow':
      state.workflowId = id;
      navigate('/emonos/workflows');
      return undefined;
    case 'wf-add-node':
      addNode(trigger.dataset.kind);
      return renderWorkspace(renderSection());
    case 'wf-edit-node':
      return openNodeEditor(trigger.dataset.key);
    case 'wf-drop-node':
      dropNode(trigger.dataset.key);
      return renderWorkspace(renderSection());
    case 'wf-link': {
      const error = toggleLink(trigger.dataset.key);
      if (error) flash(error, 'error');
      return renderWorkspace(renderSection());
    }
    case 'wf-cancel-link':
      designer.linkFrom = null;
      return renderWorkspace(renderSection());
    case 'wf-drop-transition':
      dropTransition(Number(trigger.dataset.index));
      return renderWorkspace(renderSection());
    case 'wf-save':
      if (await saveDesigner()) return renderWorkspace(renderSection());
      return undefined;
    default:
      return undefined;
  }
}
/* eslint-enable complexity */

function findTask(id) {
  return (state.view.days || []).flatMap((day) => day.tasks).find((task) => task.id === id) || null;
}

async function projectMembers() {
  if (!state.projectId) return [];
  const detail = await emonos.getProject(state.projectId);
  return detail.ok ? detail.body.members : [];
}

async function openNewTask() {
  if (!state.projectId) {
    flash('Choisissez d’abord un projet.', 'error');
    return;
  }
  const members = await projectMembers();
  openTaskEditor(null, { projectId: state.projectId, parentId: state.parentTaskId, members });
}

function openDocumentPicker(projectId) {
  const options = state.templates
    .map((template) => `<option value="${template.id}">${escapeHtml(template.name)} — ${escapeHtml(template.category)}</option>`)
    .join('');
  openModal('Instancier un modèle', `
    <form class="emonos-form" data-document-picker="${projectId}">
      <label class="emonos-field"><span>Modèle</span><select name="templateId" required>${options}</select></label>
      <footer class="emonos-form-actions">
        <button type="button" class="emonos-btn is-ghost" data-modal-close>Annuler</button>
        <button type="submit" class="emonos-btn is-primary">Instancier</button>
      </footer>
    </form>`);
  const form = document.querySelector('[data-document-picker]');
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = readForm(form);
    const result = await emonos.createDocument({ projectId, templateId: data.templateId });
    if (!result.ok) return flash(result.error, 'error');
    closeModal();
    flash('Document instancié.', 'success');
    state.view = { detail: await loadProjectDetail(projectId) };
    return renderWorkspace(renderSection());
  });
}

/* ---------- Déplacement des nœuds du concepteur ---------- */

function bindNodeDragging() {
  let dragging = null;

  document.addEventListener('pointerdown', (event) => {
    const group = event.target.closest?.('.emonos-node');
    if (!group || event.target.closest('[data-action]')) return;
    const svg = group.ownerSVGElement;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const scale = svg.viewBox.baseVal.width / rect.width;
    const node = designer.workflow?.nodes.find((n) => n.key === group.dataset.node);
    if (!node) return;
    dragging = {
      key: node.key,
      offsetX: (event.clientX - rect.left) * scale - node.x,
      offsetY: (event.clientY - rect.top) * scale - node.y,
      rect,
      scale,
    };
    group.setPointerCapture?.(event.pointerId);
  });

  document.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    const x = (event.clientX - dragging.rect.left) * dragging.scale - dragging.offsetX;
    const y = (event.clientY - dragging.rect.top) * dragging.scale - dragging.offsetY;
    moveNode(dragging.key, x, y);
    const group = document.querySelector(`.emonos-node[data-node="${dragging.key}"]`);
    const node = designer.workflow.nodes.find((n) => n.key === dragging.key);
    if (group && node) group.setAttribute('transform', `translate(${node.x},${node.y})`);
  });

  document.addEventListener('pointerup', () => {
    if (!dragging) return;
    dragging = null;
    if (document.getElementById('emonosApp') && state.section === 'workflows') {
      renderWorkspace(renderSection());
    }
  });
}
