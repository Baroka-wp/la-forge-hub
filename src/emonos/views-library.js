/**
 * EMONOS — sections « Documents templates », « Team management » et « Configuration ».
 */
import { emonos } from './api.js';
import { currentProject, state } from './state.js';
import {
  KIND_LABELS,
  MACRO_LABELS,
  ROLE_LABELS,
  chip,
  closeModal,
  emptyState,
  escapeHtml,
  flash,
  formatDate,
  modalError,
  openModal,
  optionList,
  readForm,
} from './ui.js';

/* ---------- Modèles de documents ---------- */

export async function loadTemplates() {
  const [templates, documents] = await Promise.all([
    emonos.listTemplates({}),
    state.projectId ? emonos.listDocuments(state.projectId) : Promise.resolve({ ok: true, body: { documents: [] } }),
  ]);
  state.view = templates.ok
    ? { templates: templates.body.templates, documents: documents.ok ? documents.body.documents : [] }
    : { error: templates.error };
  if (templates.ok) state.templates = templates.body.templates;
}

export function renderTemplates() {
  if (state.view.error) return emptyState('Chargement impossible', state.view.error);
  const { templates = [], documents = [] } = state.view;
  const project = currentProject();
  const byCategory = new Map();
  templates.forEach((template) => {
    if (!byCategory.has(template.category)) byCategory.set(template.category, []);
    byCategory.get(template.category).push(template);
  });

  return `
    <div class="emonos-library">
      <section class="emonos-panel">
        <header class="emonos-panel-head">
          <h2>Modèles de documents</h2>
          <button type="button" class="emonos-btn is-ghost" data-action="new-template">Nouveau modèle</button>
        </header>
        ${templates.length
          ? [...byCategory.entries()]
              .map(
                ([category, rows]) => `
            <h3 class="emonos-subtitle">${escapeHtml(category)}</h3>
            <ul class="emonos-list">
              ${rows
                .map(
                  (template) => `
                <li>
                  <span>
                    ${escapeHtml(template.name)}
                    ${template.projectKind ? chip(KIND_LABELS[template.projectKind] || template.projectKind) : ''}
                  </span>
                  <span class="emonos-list-actions">
                    <button type="button" class="emonos-btn is-ghost" data-action="edit-template" data-id="${template.id}">Éditer</button>
                    ${project
                      ? `<button type="button" class="emonos-btn is-ghost" data-action="instantiate-template" data-id="${template.id}">Instancier</button>`
                      : ''}
                    <button type="button" class="emonos-icon-btn" data-action="delete-template" data-id="${template.id}" aria-label="Supprimer">✕</button>
                  </span>
                </li>`,
                )
                .join('')}
            </ul>`,
              )
              .join('')
          : emptyState('Aucun modèle', 'Créez un modèle réutilisable pour vos projets.')}
      </section>

      <section class="emonos-panel">
        <header class="emonos-panel-head">
          <h2>Documents ${project ? `de « ${escapeHtml(project.name)} »` : 'du projet'}</h2>
        </header>
        ${project
          ? `<ul class="emonos-list">${
              documents
                .map(
                  (doc) => `
              <li>
                <span>${escapeHtml(doc.title)} <em>${formatDate(doc.updatedAt)}</em></span>
                <span class="emonos-list-actions">
                  <button type="button" class="emonos-btn is-ghost" data-action="edit-document" data-id="${doc.id}">Ouvrir</button>
                  <button type="button" class="emonos-icon-btn" data-action="delete-document" data-id="${doc.id}" aria-label="Supprimer">✕</button>
                </span>
              </li>`,
                )
                .join('') || '<li class="emonos-empty-hint">Aucun document instancié.</li>'
            }</ul>`
          : emptyState('Aucun projet sélectionné', 'Choisissez un projet pour voir ses documents.')}
      </section>
    </div>`;
}

export function openTemplateEditor(template) {
  const kinds = { '': 'Tous les types', ...KIND_LABELS };
  openModal(template ? `Éditer « ${template.name} »` : 'Nouveau modèle', `
    <form class="emonos-form" data-template-form="${template?.id || ''}">
      <div class="emonos-field-row">
        <label class="emonos-field"><span>Nom <em>*</em></span><input name="name" required maxlength="160" value="${escapeHtml(template?.name || '')}" /></label>
        <label class="emonos-field"><span>Catégorie</span><input name="category" maxlength="60" value="${escapeHtml(template?.category || 'general')}" /></label>
      </div>
      <label class="emonos-field">
        <span>Type de projet</span>
        <select name="projectKind">${optionList(kinds, template?.projectKind || '')}</select>
      </label>
      <label class="emonos-field"><span>Description</span><input name="description" maxlength="2000" value="${escapeHtml(template?.description || '')}" /></label>
      <label class="emonos-field">
        <span>Contenu (Markdown)</span>
        <textarea name="bodyMarkdown" rows="12" class="emonos-code">${escapeHtml(template?.bodyMarkdown || '')}</textarea>
      </label>
      <footer class="emonos-form-actions">
        <button type="button" class="emonos-btn is-ghost" data-modal-close>Annuler</button>
        <button type="submit" class="emonos-btn is-primary">${template ? 'Enregistrer' : 'Créer'}</button>
      </footer>
    </form>`, { size: 'lg' });
}

export async function submitTemplateForm(form) {
  const data = readForm(form);
  const payload = {
    name: data.name,
    category: data.category || 'general',
    projectKind: data.projectKind,
    description: data.description,
    bodyMarkdown: data.bodyMarkdown,
  };
  const id = form.dataset.templateForm;
  const result = id ? await emonos.patchTemplate(id, payload) : await emonos.createTemplate(payload);
  if (!result.ok) {
    modalError(result.error);
    return false;
  }
  closeModal();
  flash(id ? 'Modèle mis à jour.' : 'Modèle créé.', 'success');
  return true;
}

export function openDocumentEditor(document) {
  openModal(document.title, `
    <form class="emonos-form" data-document-form="${document.id}">
      <label class="emonos-field"><span>Titre</span><input name="title" required maxlength="200" value="${escapeHtml(document.title)}" /></label>
      <label class="emonos-field">
        <span>Contenu (Markdown)</span>
        <textarea name="bodyMarkdown" rows="16" class="emonos-code">${escapeHtml(document.bodyMarkdown || '')}</textarea>
      </label>
      <footer class="emonos-form-actions">
        <button type="button" class="emonos-btn is-ghost" data-modal-close>Fermer</button>
        <button type="submit" class="emonos-btn is-primary">Enregistrer</button>
      </footer>
    </form>`, { size: 'lg' });
}

export async function submitDocumentForm(form) {
  const data = readForm(form);
  const result = await emonos.patchDocument(form.dataset.documentForm, {
    title: data.title,
    bodyMarkdown: data.bodyMarkdown,
  });
  if (!result.ok) {
    modalError(result.error);
    return false;
  }
  closeModal();
  flash('Document enregistré.', 'success');
  return true;
}

/* ---------- Équipes ---------- */

export async function loadTeams() {
  const result = await emonos.listTeams();
  state.view = result.ok ? { teams: result.body.teams } : { error: result.error };
  if (result.ok) {
    state.teams = result.body.teams.map((team) => ({
      id: team.id,
      name: team.name,
      description: team.description,
      memberCount: team.members.length,
      projectCount: team.projectCount,
    }));
  }
}

export function renderTeams() {
  if (state.view.error) return emptyState('Chargement impossible', state.view.error);
  const { teams = [] } = state.view;
  if (!teams.length) return emptyState('Aucune équipe', 'Créez une équipe pour la réutiliser dans l’assistant de projet.');
  return `
    <div class="emonos-card-grid">
      ${teams
        .map(
          (team) => `
        <article class="emonos-card">
          <header class="emonos-card-head">
            <div>
              <h3 class="emonos-card-title">${escapeHtml(team.name)}</h3>
              <p class="emonos-card-sub">${escapeHtml(team.description || 'Sans description')}</p>
            </div>
            ${chip(`${team.projectCount} projets`)}
          </header>
          <ul class="emonos-list">
            ${team.members
              .map(
                (member) => `
              <li>
                <span>${escapeHtml(member.user.displayName)} <em>${escapeHtml(member.user.email)}</em></span>
                <span class="emonos-list-actions">
                  ${chip(ROLE_LABELS[member.role] || member.role)}
                  <button type="button" class="emonos-icon-btn" data-action="remove-team-member" data-id="${team.id}" data-user="${member.user.id}" aria-label="Retirer">✕</button>
                </span>
              </li>`,
              )
              .join('') || '<li class="emonos-empty-hint">Aucun membre.</li>'}
          </ul>
          <footer class="emonos-card-actions">
            <button type="button" class="emonos-btn is-ghost" data-action="add-team-member" data-id="${team.id}">Ajouter un membre</button>
            <button type="button" class="emonos-btn is-ghost" data-action="edit-team" data-id="${team.id}">Éditer</button>
            <button type="button" class="emonos-btn is-danger" data-action="delete-team" data-id="${team.id}">Supprimer</button>
          </footer>
        </article>`,
        )
        .join('')}
    </div>`;
}

export function openTeamEditor(team) {
  openModal(team ? `Éditer « ${team.name} »` : 'Nouvelle équipe', `
    <form class="emonos-form" data-team-form="${team?.id || ''}">
      <label class="emonos-field"><span>Nom <em>*</em></span><input name="name" required maxlength="120" value="${escapeHtml(team?.name || '')}" /></label>
      <label class="emonos-field"><span>Description</span><textarea name="description" rows="3">${escapeHtml(team?.description || '')}</textarea></label>
      <footer class="emonos-form-actions">
        <button type="button" class="emonos-btn is-ghost" data-modal-close>Annuler</button>
        <button type="submit" class="emonos-btn is-primary">${team ? 'Enregistrer' : 'Créer'}</button>
      </footer>
    </form>`);
}

export async function submitTeamForm(form) {
  const data = readForm(form);
  const id = form.dataset.teamForm;
  const result = id
    ? await emonos.patchTeam(id, { name: data.name, description: data.description })
    : await emonos.createTeam({ name: data.name, description: data.description });
  if (!result.ok) {
    modalError(result.error);
    return false;
  }
  closeModal();
  flash(id ? 'Équipe mise à jour.' : 'Équipe créée.', 'success');
  return true;
}

export function openTeamMemberPicker(teamId) {
  openModal('Ajouter un membre', `
    <form class="emonos-form" data-team-member-form="${teamId}">
      <label class="emonos-field"><span>Adresse e-mail du compte</span><input name="email" type="email" required placeholder="prenom@exemple.com" /></label>
      <label class="emonos-field"><span>Rôle</span><select name="role">${optionList(ROLE_LABELS, 'MEMBER')}</select></label>
      <footer class="emonos-form-actions">
        <button type="button" class="emonos-btn is-ghost" data-modal-close>Annuler</button>
        <button type="submit" class="emonos-btn is-primary">Ajouter</button>
      </footer>
    </form>`);
}

/* ---------- Configuration ---------- */

export async function loadConfig() {
  const [blueprints, workflows, mine] = await Promise.all([
    emonos.bootstrap(),
    emonos.listWorkflows(),
    emonos.myTasks(),
  ]);
  state.view = blueprints.ok
    ? {
        blueprints: blueprints.body.blueprints,
        workflows: workflows.ok ? workflows.body.workflows : [],
        myTasks: mine.ok ? mine.body.tasks : [],
      }
    : { error: blueprints.error };
}

export function renderConfig() {
  if (state.view.error) return emptyState('Chargement impossible', state.view.error);
  const { blueprints = [], workflows = [], myTasks = [] } = state.view;
  return `
    <div class="emonos-library">
      <section class="emonos-panel">
        <header class="emonos-panel-head"><h2>Mes tâches</h2></header>
        <ul class="emonos-list">
          ${myTasks
            .map(
              (task) => `
            <li>
              <span>${escapeHtml(task.title)} <em>${escapeHtml(task.project?.name || '')}</em></span>
              <span class="emonos-list-actions">${chip(formatDate(task.dueDate))}</span>
            </li>`,
            )
            .join('') || '<li class="emonos-empty-hint">Aucune tâche ne vous est assignée.</li>'}
        </ul>
      </section>

      <section class="emonos-panel">
        <header class="emonos-panel-head"><h2>Types de projet disponibles</h2></header>
        <ul class="emonos-list">
          ${blueprints
            .map(
              (blueprint) => `
            <li>
              <span><strong>${escapeHtml(blueprint.label)}</strong> — ${escapeHtml(blueprint.description)}</span>
              <span class="emonos-list-actions">${chip(`${blueprint.taskCount} tâches`)}${chip(`${blueprint.durationDays} j`)}</span>
            </li>`,
            )
            .join('')}
        </ul>
      </section>

      <section class="emonos-panel">
        <header class="emonos-panel-head"><h2>Workflows installés</h2></header>
        <ul class="emonos-list">
          ${workflows
            .map(
              (workflow) => `
            <li>
              <span>${escapeHtml(workflow.name)}</span>
              <span class="emonos-list-actions">
                ${chip(`${workflow.nodeCount} nœuds`)}${chip(`${workflow.runCount} exécutions`)}
                <button type="button" class="emonos-btn is-ghost" data-action="open-workflow" data-id="${workflow.id}">Ouvrir</button>
              </span>
            </li>`,
            )
            .join('') || '<li class="emonos-empty-hint">Aucun workflow.</li>'}
        </ul>
      </section>

      <section class="emonos-panel">
        <header class="emonos-panel-head"><h2>Macros de tâche</h2></header>
        <p class="emonos-form-hint">
          Ces identifiants alimentent les propriétés <code>event_dashboard</code> et
          <code>event_configure</code> : une tâche n’affiche le bouton correspondant que si la macro est renseignée.
        </p>
        <ul class="emonos-list">
          ${Object.entries(MACRO_LABELS)
            .map(([key, label]) => `<li><span><code>${escapeHtml(key)}</code></span><span class="emonos-list-actions">${escapeHtml(label)}</span></li>`)
            .join('')}
        </ul>
      </section>
    </div>`;
}
