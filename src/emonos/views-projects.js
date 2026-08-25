/**
 * EMONOS — écran « Project management » : liste groupée, assistant de création
 * en quatre étapes et fiche projet (membres, documents, workflow en cours).
 */
import { emonos } from './api.js';
import { projectTree, state } from './state.js';
import {
  DATE_MODE_LABELS,
  KIND_LABELS,
  PRIORITY_LABELS,
  ROLE_LABELS,
  STAGE_LABELS,
  STATE_LABELS,
  chip,
  closeModal,
  dateInputValue,
  emptyState,
  escapeHtml,
  flash,
  formatDate,
  modalError,
  openModal,
  optionList,
  priorityChip,
  readForm,
} from './ui.js';

/** Brouillon de l'assistant, conservé entre les quatre étapes. */
const wizard = {
  step: 1,
  name: '',
  parentId: '',
  notes: '',
  kind: 'SOFTWARE_DEV',
  dateMode: 'NONE',
  startDate: '',
  dueDate: '',
  teamId: 'auto',
  priority: 'NORMAL',
};

export async function loadProjects() {
  const result = await emonos.listProjects({
    groupBy: state.filters.groupBy,
    scope: state.filters.scope,
    archived: state.filters.archived ? '1' : '0',
  });
  state.view = result.ok ? result.body : { projects: [], groups: [], error: result.error };
  if (result.ok) state.projects = result.body.projects;
}

export function renderProjects() {
  const { groups, projects = [], error } = state.view;
  if (error) return emptyState('Chargement impossible', error);
  if (!projects.length) {
    return emptyState(
      state.filters.archived ? 'Aucun projet archivé' : 'Aucun projet',
      'Utilisez le bouton + de la barre d’outils pour lancer l’assistant de création.',
    );
  }
  const blocks = groups?.length
    ? groups.map((group) => renderGroup(groupLabel(group), group.projects)).join('')
    : renderGroup(null, projects);
  return `<div class="emonos-project-groups">${blocks}</div>`;
}

function groupLabel(group) {
  if (state.filters.groupBy === 'priority') return PRIORITY_LABELS[group.key] || group.label;
  if (state.filters.groupBy === 'stage') return STAGE_LABELS[group.key] || group.label;
  return group.label;
}

function renderGroup(label, projects) {
  return `
    <section class="emonos-group">
      ${label ? `<h2 class="emonos-group-title">${escapeHtml(label)} <span class="emonos-count">${projects.length}</span></h2>` : ''}
      <div class="emonos-card-grid">${projects.map(renderProjectCard).join('')}</div>
    </section>`;
}

function renderProjectCard(project) {
  const parent = state.projects.find((p) => p.id === project.parentId);
  return `
    <article class="emonos-card emonos-project-card${project.id === state.projectId ? ' is-current' : ''}" data-project-card="${project.id}">
      <header class="emonos-card-head">
        <div>
          <h3 class="emonos-card-title">${escapeHtml(project.name)}</h3>
          <p class="emonos-card-sub">${escapeHtml(KIND_LABELS[project.kind] || project.kind)}${
            parent ? ` · sous-projet de ${escapeHtml(parent.name)}` : ''
          }</p>
        </div>
        ${priorityChip(project.priority)}
      </header>
      <dl class="emonos-meta">
        <div><dt>Étape</dt><dd>${escapeHtml(STAGE_LABELS[project.stage] || project.stage)}</dd></div>
        <div><dt>Responsable</dt><dd>${escapeHtml(project.owner?.displayName || '—')}</dd></div>
        <div><dt>Équipe</dt><dd>${escapeHtml(project.team?.name || '—')}</dd></div>
        <div><dt>Échéance</dt><dd>${formatDate(project.dueDate)}</dd></div>
      </dl>
      <p class="emonos-card-counts">
        ${chip(`${project.taskCount ?? 0} tâches`)}
        ${chip(`${project.documentCount ?? 0} documents`)}
        ${project.childCount ? chip(`${project.childCount} sous-projets`) : ''}
        ${project.archived ? chip('Archivé', 'muted') : ''}
      </p>
      <footer class="emonos-card-actions">
        <button type="button" class="emonos-btn" data-action="open-project" data-id="${project.id}">Ouvrir</button>
        <button type="button" class="emonos-btn is-ghost" data-action="project-tasks" data-id="${project.id}">Tâches</button>
        <button type="button" class="emonos-btn is-ghost" data-action="edit-project" data-id="${project.id}">Éditer</button>
        <button type="button" class="emonos-btn is-ghost" data-action="toggle-archive-project" data-id="${project.id}">
          ${project.archived ? 'Désarchiver' : 'Archiver'}
        </button>
        <button type="button" class="emonos-btn is-danger" data-action="delete-project" data-id="${project.id}">Supprimer</button>
      </footer>
    </article>`;
}

/* ---------- Assistant de création ---------- */

export function openWizard() {
  Object.assign(wizard, {
    step: 1, name: '', parentId: state.projectId || '', notes: '',
    kind: 'SOFTWARE_DEV', dateMode: 'NONE', startDate: '', dueDate: '', teamId: 'auto', priority: 'NORMAL',
  });
  renderWizard();
}

export function renderWizard() {
  openModal('Nouveau projet', wizardStepHtml(), { size: 'lg' });
}

/** Bouton « Retour » de l'assistant : le brouillon des étapes déjà saisies est conservé. */
export function wizardBack() {
  if (wizard.step <= 1) return;
  wizard.step -= 1;
  renderWizard();
}

function wizardStepHtml() {
  const steps = ['Projet', 'Type', 'Dates', 'Équipe'];
  const rail = steps
    .map((label, index) => {
      const position = index + 1;
      const status = position === wizard.step ? 'is-current' : position < wizard.step ? 'is-done' : '';
      return `<li class="${status}"><span>${position}</span>${escapeHtml(label)}</li>`;
    })
    .join('');
  return `
    <ol class="emonos-wizard-rail">${rail}</ol>
    <form class="emonos-form" data-wizard-step="${wizard.step}">
      ${[stepProject, stepKind, stepDates, stepTeam][wizard.step - 1]()}
      <footer class="emonos-form-actions">
        ${wizard.step > 1 ? '<button type="button" class="emonos-btn is-ghost" data-action="wizard-back">Retour</button>' : ''}
        <button type="submit" class="emonos-btn is-primary">${wizard.step === 4 ? 'Créer le projet' : 'Suivant'}</button>
      </footer>
    </form>`;
}

function stepProject() {
  const parents = projectTree(state.projects.filter((p) => !p.archived))
    .map(({ project, depth }) =>
      `<option value="${project.id}"${project.id === wizard.parentId ? ' selected' : ''}>${'— '.repeat(depth)}${escapeHtml(project.name)}</option>`)
    .join('');
  return `
    <p class="emonos-form-lead">Définissons votre nouveau projet.</p>
    <label class="emonos-field">
      <span>Nom <em>*</em></span>
      <input name="name" required maxlength="160" value="${escapeHtml(wizard.name)}" placeholder="Nom de votre nouveau projet" />
    </label>
    <label class="emonos-field">
      <span>Projet parent</span>
      <select name="parentId"><option value="">Aucun (projet racine)</option>${parents}</select>
    </label>
    <label class="emonos-field">
      <span>Priorité</span>
      <select name="priority">${optionList(PRIORITY_LABELS, wizard.priority)}</select>
    </label>
    <label class="emonos-field">
      <span>Notes</span>
      <textarea name="notes" rows="4" maxlength="5000" placeholder="Notes sur le nouveau projet">${escapeHtml(wizard.notes)}</textarea>
    </label>`;
}

function stepKind() {
  const cards = state.blueprints
    .map(
      (blueprint) => `
      <label class="emonos-choice${blueprint.kind === wizard.kind ? ' is-selected' : ''}">
        <input type="radio" name="kind" value="${blueprint.kind}"${blueprint.kind === wizard.kind ? ' checked' : ''} />
        <span class="emonos-choice-title">${escapeHtml(blueprint.label)}</span>
        <span class="emonos-choice-text">${escapeHtml(blueprint.headline)}</span>
        <span class="emonos-choice-meta">${blueprint.taskCount} tâches · ${blueprint.documentCount} documents · workflow « ${escapeHtml(blueprint.workflowName)} »</span>
      </label>`,
    )
    .join('');
  return `
    <p class="emonos-form-lead">Quel type de projet créez-vous ?</p>
    <div class="emonos-choice-grid">${cards}</div>
    <label class="emonos-check">
      <input type="checkbox" name="applyBlueprint" checked />
      <span>Déployer les tâches, documents et le workflow du modèle</span>
    </label>`;
}

function stepDates() {
  return `
    <p class="emonos-form-lead">Définissez les dates de votre projet.</p>
    <div class="emonos-choice-grid is-compact">
      ${Object.entries(DATE_MODE_LABELS)
        .map(
          ([value, label]) => `
        <label class="emonos-choice${value === wizard.dateMode ? ' is-selected' : ''}">
          <input type="radio" name="dateMode" value="${value}"${value === wizard.dateMode ? ' checked' : ''} />
          <span class="emonos-choice-title">${escapeHtml(label)}</span>
          <span class="emonos-choice-text">${escapeHtml(dateModeHint(value))}</span>
        </label>`,
        )
        .join('')}
    </div>
    <div class="emonos-field-row">
      <label class="emonos-field">
        <span>Date de début</span>
        <input type="date" name="startDate" value="${escapeHtml(wizard.startDate)}" />
      </label>
      <label class="emonos-field">
        <span>Échéance</span>
        <input type="date" name="dueDate" value="${escapeHtml(wizard.dueDate)}" />
      </label>
    </div>
    <p class="emonos-form-hint">En mode automatique, l’échéance est calculée depuis la durée du modèle choisi.</p>`;
}

function dateModeHint(mode) {
  if (mode === 'NONE') return 'Le projet n’est pas planifié dans le temps.';
  if (mode === 'FIXED') return 'Vous fixez la date de début et la date limite.';
  return 'Seule la date de début est nécessaire.';
}

function stepTeam() {
  const teams = state.teams
    .map(
      (team) => `
      <label class="emonos-choice${team.id === wizard.teamId ? ' is-selected' : ''}">
        <input type="radio" name="teamId" value="${team.id}"${team.id === wizard.teamId ? ' checked' : ''} />
        <span class="emonos-choice-title">${escapeHtml(team.name)}</span>
        <span class="emonos-choice-text">${escapeHtml(team.description || 'Équipe sans description')}</span>
        <span class="emonos-choice-meta">${team.memberCount ?? 0} membres · ${team.projectCount ?? 0} projets</span>
      </label>`,
    )
    .join('');
  return `
    <p class="emonos-form-lead">Importez ou choisissez les membres de votre équipe.</p>
    <div class="emonos-choice-grid">
      <label class="emonos-choice${wizard.teamId === 'auto' ? ' is-selected' : ''}">
        <input type="radio" name="teamId" value="auto"${wizard.teamId === 'auto' ? ' checked' : ''} />
        <span class="emonos-choice-title">Automatique</span>
        <span class="emonos-choice-text">L’équipe la moins chargée est affectée au projet.</span>
      </label>
      <label class="emonos-choice${wizard.teamId === 'none' ? ' is-selected' : ''}">
        <input type="radio" name="teamId" value="none"${wizard.teamId === 'none' ? ' checked' : ''} />
        <span class="emonos-choice-title">Sans équipe</span>
        <span class="emonos-choice-text">Vous ajouterez les membres plus tard.</span>
      </label>
      ${teams}
    </div>`;
}

/**
 * Enchaîne les étapes ; à la dernière, crée le projet.
 * @returns {Promise<false | { created: object }>} `false` tant qu'il reste des étapes.
 */
export async function submitWizard(form) {
  const data = readForm(form);
  if (wizard.step === 1) {
    if (!data.name) {
      modalError('Le nom du projet est obligatoire.');
      return false;
    }
    Object.assign(wizard, {
      name: data.name,
      parentId: data.parentId || '',
      notes: data.notes || '',
      priority: data.priority || 'NORMAL',
      step: 2,
    });
    renderWizard();
    return false;
  }
  if (wizard.step === 2) {
    wizard.kind = data.kind || 'SOFTWARE_DEV';
    wizard.applyBlueprint = data.applyBlueprint !== null;
    wizard.step = 3;
    renderWizard();
    return false;
  }
  if (wizard.step === 3) {
    wizard.dateMode = data.dateMode || 'NONE';
    wizard.startDate = data.startDate || '';
    wizard.dueDate = data.dueDate || '';
    if (wizard.dateMode !== 'NONE' && !wizard.startDate) {
      modalError('Une date de début est nécessaire pour ce mode.');
      return false;
    }
    if (wizard.dateMode === 'FIXED' && wizard.dueDate && wizard.dueDate < wizard.startDate) {
      modalError('L’échéance précède la date de début.');
      return false;
    }
    wizard.step = 4;
    renderWizard();
    return false;
  }

  wizard.teamId = data.teamId || 'none';
  const payload = {
    name: wizard.name,
    parentId: wizard.parentId || null,
    notes: wizard.notes || null,
    kind: wizard.kind,
    priority: wizard.priority,
    dateMode: wizard.dateMode,
    startDate: wizard.startDate ? `${wizard.startDate}T00:00:00.000Z` : null,
    dueDate: wizard.dueDate ? `${wizard.dueDate}T00:00:00.000Z` : null,
    teamId: wizard.teamId,
    applyBlueprint: wizard.applyBlueprint !== false,
  };
  const result = await emonos.createProject(payload);
  if (!result.ok) {
    modalError(result.error);
    return false;
  }
  closeModal();
  const { created, project } = result.body;
  flash(
    created.tasks
      ? `Projet « ${project.name} » créé : ${created.tasks} tâches et ${created.documents} documents déployés.`
      : `Projet « ${project.name} » créé.`,
    'success',
  );
  return { created: project };
}

/* ---------- Édition ---------- */

export function openProjectEditor(project) {
  const parents = projectTree(state.projects.filter((p) => p.id !== project.id))
    .map(({ project: candidate, depth }) =>
      `<option value="${candidate.id}"${candidate.id === project.parentId ? ' selected' : ''}>${'— '.repeat(depth)}${escapeHtml(candidate.name)}</option>`)
    .join('');
  const teams = state.teams
    .map((team) => `<option value="${team.id}"${team.id === project.team?.id ? ' selected' : ''}>${escapeHtml(team.name)}</option>`)
    .join('');
  openModal(`Éditer « ${project.name} »`, `
    <form class="emonos-form" data-project-form="${project.id}">
      <label class="emonos-field"><span>Nom</span><input name="name" required maxlength="160" value="${escapeHtml(project.name)}" /></label>
      <div class="emonos-field-row">
        <label class="emonos-field"><span>Type</span><select name="kind">${optionList(KIND_LABELS, project.kind)}</select></label>
        <label class="emonos-field"><span>Étape</span><select name="stage">${optionList(STAGE_LABELS, project.stage)}</select></label>
      </div>
      <div class="emonos-field-row">
        <label class="emonos-field"><span>Priorité</span><select name="priority">${optionList(PRIORITY_LABELS, project.priority)}</select></label>
        <label class="emonos-field"><span>Mode de dates</span><select name="dateMode">${optionList(DATE_MODE_LABELS, project.dateMode)}</select></label>
      </div>
      <div class="emonos-field-row">
        <label class="emonos-field"><span>Date de début</span><input type="date" name="startDate" value="${dateInputValue(project.startDate)}" /></label>
        <label class="emonos-field"><span>Échéance</span><input type="date" name="dueDate" value="${dateInputValue(project.dueDate)}" /></label>
      </div>
      <div class="emonos-field-row">
        <label class="emonos-field"><span>Projet parent</span><select name="parentId"><option value="">Aucun</option>${parents}</select></label>
        <label class="emonos-field"><span>Équipe</span><select name="teamId"><option value="none">Aucune</option>${teams}</select></label>
      </div>
      <label class="emonos-field"><span>Notes</span><textarea name="notes" rows="4">${escapeHtml(project.notes || '')}</textarea></label>
      <footer class="emonos-form-actions">
        <button type="button" class="emonos-btn is-ghost" data-modal-close>Annuler</button>
        <button type="submit" class="emonos-btn is-primary">Enregistrer</button>
      </footer>
    </form>`, { size: 'lg' });
}

export async function submitProjectForm(form) {
  const data = readForm(form);
  const payload = {
    name: data.name,
    kind: data.kind,
    stage: data.stage,
    priority: data.priority,
    dateMode: data.dateMode,
    startDate: data.startDate ? `${data.startDate}T00:00:00.000Z` : null,
    dueDate: data.dueDate ? `${data.dueDate}T00:00:00.000Z` : null,
    parentId: data.parentId || null,
    teamId: data.teamId || 'none',
    notes: data.notes,
  };
  const result = await emonos.patchProject(form.dataset.projectForm, payload);
  if (!result.ok) {
    modalError(result.error);
    return false;
  }
  closeModal();
  flash('Projet mis à jour.', 'success');
  return true;
}

/* ---------- Fiche projet ---------- */

export async function loadProjectDetail(projectId) {
  const [detail, runs] = await Promise.all([emonos.getProject(projectId), emonos.listRuns(projectId)]);
  if (!detail.ok) return { error: detail.error };
  return { ...detail.body, runs: runs.ok ? runs.body.runs : [] };
}

export function renderProjectDetail(detail) {
  if (detail.error) return emptyState('Projet indisponible', detail.error);
  const { project, members, documents, taskStates, runs, role } = detail;
  const run = runs.find((r) => r.status === 'RUNNING') || runs[0] || null;
  return `
    <div class="emonos-detail">
      <section class="emonos-panel">
        <header class="emonos-panel-head">
          <h2>${escapeHtml(project.name)}</h2>
          ${chip(ROLE_LABELS[role] || role)}
        </header>
        <dl class="emonos-meta is-wide">
          <div><dt>Type</dt><dd>${escapeHtml(KIND_LABELS[project.kind] || project.kind)}</dd></div>
          <div><dt>Étape</dt><dd>${escapeHtml(STAGE_LABELS[project.stage] || project.stage)}</dd></div>
          <div><dt>Priorité</dt><dd>${escapeHtml(PRIORITY_LABELS[project.priority])}</dd></div>
          <div><dt>Dates</dt><dd>${formatDate(project.startDate)} → ${formatDate(project.dueDate)}</dd></div>
          <div><dt>Fuseau</dt><dd>${escapeHtml(project.timezone)}</dd></div>
        </dl>
        ${project.notes ? `<p class="emonos-notes">${escapeHtml(project.notes)}</p>` : ''}
        <div class="emonos-stat-row">
          ${Object.entries(taskStates || {})
            .map(([stateKey, count]) => `<div class="emonos-stat"><strong>${count}</strong><span>${escapeHtml(STATE_LABELS[stateKey] || stateKey)}</span></div>`)
            .join('') || '<p class="emonos-empty-hint">Aucune tâche active.</p>'}
        </div>
      </section>

      <section class="emonos-panel">
        <header class="emonos-panel-head">
          <h2>Workflow</h2>
          <button type="button" class="emonos-btn is-ghost" data-action="restart-run" data-id="${project.id}">
            ${run ? 'Redémarrer' : 'Démarrer'}
          </button>
        </header>
        ${run ? renderRun(run) : emptyState('Aucune exécution', 'Démarrez le workflow du type de projet.')}
      </section>

      <section class="emonos-panel">
        <header class="emonos-panel-head">
          <h2>Équipe du projet</h2>
          <button type="button" class="emonos-btn is-ghost" data-action="add-project-member" data-id="${project.id}">Ajouter</button>
        </header>
        <ul class="emonos-list">
          ${members
            .map(
              (member) => `
            <li>
              <span>${escapeHtml(member.user.displayName)} <em>${escapeHtml(member.user.email)}</em></span>
              <span class="emonos-list-actions">
                ${chip(ROLE_LABELS[member.role] || member.role)}
                <button type="button" class="emonos-icon-btn" data-action="remove-project-member" data-id="${project.id}" data-user="${member.user.id}" aria-label="Retirer">✕</button>
              </span>
            </li>`,
            )
            .join('') || '<li class="emonos-empty-hint">Aucun membre.</li>'}
        </ul>
      </section>

      <section class="emonos-panel">
        <header class="emonos-panel-head">
          <h2>Documents du projet</h2>
          <button type="button" class="emonos-btn is-ghost" data-action="new-document" data-id="${project.id}">Instancier un modèle</button>
        </header>
        <ul class="emonos-list">
          ${documents
            .map(
              (doc) => `
            <li>
              <span>${escapeHtml(doc.title)}</span>
              <span class="emonos-list-actions">
                <button type="button" class="emonos-btn is-ghost" data-action="edit-document" data-id="${doc.id}">Ouvrir</button>
                <button type="button" class="emonos-icon-btn" data-action="delete-document" data-id="${doc.id}" aria-label="Supprimer">✕</button>
              </span>
            </li>`,
            )
            .join('') || '<li class="emonos-empty-hint">Aucun document.</li>'}
        </ul>
      </section>
    </div>`;
}

function renderRun(run) {
  const logs = run.logs || [];
  const options = run.options || [];
  return `
    <div class="emonos-run">
      <p class="emonos-run-head">
        <strong>${escapeHtml(run.workflow?.name || 'Workflow')}</strong>
        ${chip(run.status === 'RUNNING' ? 'En cours' : run.status === 'DONE' ? 'Terminé' : 'Annulé', run.status === 'RUNNING' ? 'success' : 'muted')}
      </p>
      <p class="emonos-run-current">Étape courante : <strong>${escapeHtml(run.currentNode?.label || '—')}</strong></p>
      ${
        run.status === 'RUNNING'
          ? `<div class="emonos-run-actions">${
              options.length
                ? options
                    .map(
                      (option) => `<button type="button" class="emonos-btn is-primary" data-action="advance-run" data-id="${run.id}" data-decision="${escapeHtml(option.label)}">
                        ${escapeHtml(option.label || `Avancer vers ${option.to.label}`)}
                      </button>`,
                    )
                    .join('')
                : `<button type="button" class="emonos-btn is-primary" data-action="advance-run" data-id="${run.id}" data-decision="">Terminer</button>`
            }
            <button type="button" class="emonos-btn is-ghost" data-action="cancel-run" data-id="${run.id}">Annuler l’exécution</button>
            </div>`
          : ''
      }
      <ol class="emonos-run-log">
        ${logs
          .map(
            (log) => `<li>
              <span class="emonos-run-log-node">${escapeHtml(log.node?.label || '—')}</span>
              ${log.decision ? chip(log.decision, 'accent') : ''}
              ${log.task ? `<span class="emonos-run-log-task">→ ${escapeHtml(log.task.title)}</span>` : ''}
              ${log.note ? `<span class="emonos-run-log-note">${escapeHtml(log.note)}</span>` : ''}
              <time>${formatDate(log.createdAt)}</time>
            </li>`,
          )
          .join('')}
      </ol>
    </div>`;
}

export function openMemberPicker(projectId) {
  openModal('Ajouter un membre', `
    <form class="emonos-form" data-member-form="${projectId}">
      <label class="emonos-field">
        <span>Adresse e-mail du compte</span>
        <input name="email" type="email" required placeholder="prenom@exemple.com" />
      </label>
      <label class="emonos-field">
        <span>Rôle</span>
        <select name="role">${optionList(ROLE_LABELS, 'MEMBER')}</select>
      </label>
      <footer class="emonos-form-actions">
        <button type="button" class="emonos-btn is-ghost" data-modal-close>Annuler</button>
        <button type="submit" class="emonos-btn is-primary">Ajouter</button>
      </footer>
    </form>`);
}
