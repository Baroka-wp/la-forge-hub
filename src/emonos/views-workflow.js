/**
 * EMONOS — concepteur de workflow.
 *
 * Le graphe est édité localement (déplacement des nœuds, ajout d'étapes, de
 * décisions et de nœuds « sous-tâche » embarqués), puis enregistré d'un bloc.
 */
import { emonos } from './api.js';
import { state } from './state.js';
import {
  KIND_LABELS,
  NODE_KIND_LABELS,
  PRIORITY_LABELS,
  closeModal,
  emptyState,
  escapeHtml,
  flash,
  modalError,
  openModal,
  optionList,
  readForm,
} from './ui.js';

const NODE_WIDTH = 168;
const NODE_HEIGHT = 64;

/** Graphe en cours d'édition (copie locale, enregistrée par « Enregistrer »). */
export const designer = {
  workflow: null,
  dirty: false,
  /** Clé du nœud source quand une liaison est en cours. */
  linkFrom: null,
  selected: null,
};

export async function loadWorkflows() {
  const list = await emonos.listWorkflows();
  if (!list.ok) {
    state.view = { error: list.error };
    return;
  }
  state.workflows = list.body.workflows;
  if (!state.workflowId && state.workflows.length) state.workflowId = state.workflows[0].id;
  if (!state.workflowId) {
    state.view = { workflows: [] };
    designer.workflow = null;
    return;
  }
  const detail = await emonos.getWorkflow(state.workflowId);
  if (!detail.ok) {
    state.view = { error: detail.error };
    return;
  }
  designer.workflow = detail.body.workflow;
  designer.dirty = false;
  designer.linkFrom = null;
  designer.selected = null;
  state.view = { workflows: state.workflows };
}

export function renderWorkflows() {
  if (state.view.error) return emptyState('Chargement impossible', state.view.error);
  const workflow = designer.workflow;
  if (!workflow) {
    return emptyState('Aucun workflow', 'Créez un workflow depuis la barre d’outils pour ouvrir le concepteur.');
  }
  return `
    <div class="emonos-designer">
      <header class="emonos-designer-head">
        <div>
          <h2>${escapeHtml(workflow.name)}</h2>
          <p class="emonos-card-sub">${escapeHtml(workflow.description || 'Sans description')}${
            workflow.projectKind ? ` · ${escapeHtml(KIND_LABELS[workflow.projectKind])}` : ''
          }</p>
        </div>
        <div class="emonos-designer-actions">
          <button type="button" class="emonos-btn is-ghost" data-action="wf-add-node" data-kind="STEP">+ Étape</button>
          <button type="button" class="emonos-btn is-ghost" data-action="wf-add-node" data-kind="DECISION">+ Décision</button>
          <button type="button" class="emonos-btn is-ghost" data-action="wf-add-node" data-kind="SUBTASK">+ Sous-tâche</button>
          <button type="button" class="emonos-btn is-ghost" data-action="wf-add-node" data-kind="END">+ Fin</button>
          <button type="button" class="emonos-btn is-primary" data-action="wf-save"${designer.dirty ? '' : ' disabled'}>Enregistrer</button>
        </div>
      </header>
      ${designer.linkFrom
        ? `<p class="emonos-designer-hint">Liaison depuis <strong>${escapeHtml(nodeByKey(designer.linkFrom)?.label || '')}</strong> : cliquez sur le nœud d’arrivée, ou <button type="button" class="emonos-link-btn" data-action="wf-cancel-link">annulez</button>.</p>`
        : '<p class="emonos-designer-hint">Glissez un nœud pour le déplacer. Le bouton ⇢ démarre une liaison.</p>'}
      <div class="emonos-canvas-wrap">${renderCanvas(workflow)}</div>
      ${renderTransitionTable(workflow)}
    </div>`;
}

function nodeByKey(key) {
  return designer.workflow?.nodes.find((n) => n.key === key) || null;
}

function renderCanvas(workflow) {
  const width = Math.max(1280, ...workflow.nodes.map((n) => n.x + NODE_WIDTH + 80));
  const height = Math.max(460, ...workflow.nodes.map((n) => n.y + NODE_HEIGHT + 80));
  const edges = workflow.transitions
    .map((transition) => {
      const from = nodeByKey(transition.from);
      const to = nodeByKey(transition.to);
      if (!from || !to) return '';
      const x1 = from.x + NODE_WIDTH;
      const y1 = from.y + NODE_HEIGHT / 2;
      const x2 = to.x;
      const y2 = to.y + NODE_HEIGHT / 2;
      const midX = (x1 + x2) / 2;
      return `
        <path d="M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}" class="emonos-edge" marker-end="url(#emonos-arrow)" />
        ${transition.label
          ? `<text x="${midX}" y="${(y1 + y2) / 2 - 8}" class="emonos-edge-label" text-anchor="middle">${escapeHtml(transition.label)}</text>`
          : ''}`;
    })
    .join('');

  const nodes = workflow.nodes
    .map((node) => {
      const selected = designer.selected === node.key ? ' is-selected' : '';
      const linking = designer.linkFrom === node.key ? ' is-linking' : '';
      return `
        <g class="emonos-node is-${node.kind.toLowerCase()}${selected}${linking}" data-node="${node.key}"
           transform="translate(${node.x},${node.y})">
          <rect width="${NODE_WIDTH}" height="${NODE_HEIGHT}" rx="14" />
          <text x="14" y="26" class="emonos-node-kind">${escapeHtml(NODE_KIND_LABELS[node.kind] || node.kind)}</text>
          <text x="14" y="46" class="emonos-node-label">${escapeHtml(truncate(node.label, 20))}</text>
          <g class="emonos-node-tools" transform="translate(${NODE_WIDTH - 62}, 8)">
            <circle cx="10" cy="10" r="10" data-action="wf-link" data-key="${node.key}" />
            <text x="10" y="14" text-anchor="middle" data-action="wf-link" data-key="${node.key}">⇢</text>
            <circle cx="38" cy="10" r="10" data-action="wf-edit-node" data-key="${node.key}" />
            <text x="38" y="14" text-anchor="middle" data-action="wf-edit-node" data-key="${node.key}">✎</text>
          </g>
        </g>`;
    })
    .join('');

  return `
    <svg class="emonos-canvas" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Graphe du workflow">
      <defs>
        <marker id="emonos-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" />
        </marker>
      </defs>
      ${edges}
      ${nodes}
    </svg>`;
}

function truncate(value, max) {
  const str = String(value);
  return str.length > max ? `${str.slice(0, max - 1)}…` : str;
}

function renderTransitionTable(workflow) {
  if (!workflow.transitions.length) {
    return '<p class="emonos-empty-hint">Aucune transition : reliez les nœuds avec le bouton ⇢.</p>';
  }
  return `
    <table class="emonos-table">
      <caption>Transitions</caption>
      <thead><tr><th>Depuis</th><th>Vers</th><th>Étiquette</th><th></th></tr></thead>
      <tbody>
        ${workflow.transitions
          .map(
            (transition, index) => `
          <tr>
            <td>${escapeHtml(nodeByKey(transition.from)?.label || transition.from)}</td>
            <td>${escapeHtml(nodeByKey(transition.to)?.label || transition.to)}</td>
            <td>
              <input class="emonos-inline-input" data-action="wf-label" data-index="${index}"
                     value="${escapeHtml(transition.label || '')}" placeholder="ex. GO" maxlength="60" />
            </td>
            <td><button type="button" class="emonos-icon-btn" data-action="wf-drop-transition" data-index="${index}" aria-label="Supprimer">✕</button></td>
          </tr>`,
          )
          .join('')}
      </tbody>
    </table>`;
}

/* ---------- Mutations locales ---------- */

export function addNode(kind) {
  const workflow = designer.workflow;
  if (!workflow) return;
  const base = kind.toLowerCase();
  let index = workflow.nodes.length + 1;
  while (workflow.nodes.some((n) => n.key === `${base}-${index}`)) index += 1;
  const key = `${base}-${index}`;
  const column = workflow.nodes.length % 5;
  const row = Math.floor(workflow.nodes.length / 5);
  workflow.nodes.push({
    key,
    kind,
    label: NODE_KIND_LABELS[kind] || kind,
    x: 60 + column * (NODE_WIDTH + 60),
    y: 60 + row * (NODE_HEIGHT + 80),
    macro: kind === 'SUBTASK' ? { title: 'Nouvelle sous-tâche', priority: 'NORMAL' } : null,
  });
  designer.dirty = true;
  designer.selected = key;
}

export function moveNode(key, x, y) {
  const node = nodeByKey(key);
  if (!node) return;
  node.x = Math.max(0, Math.round(x));
  node.y = Math.max(0, Math.round(y));
  designer.dirty = true;
}

export function toggleLink(key) {
  if (!designer.linkFrom) {
    designer.linkFrom = key;
    return null;
  }
  if (designer.linkFrom === key) {
    designer.linkFrom = null;
    return null;
  }
  const from = designer.linkFrom;
  designer.linkFrom = null;
  const exists = designer.workflow.transitions.some((t) => t.from === from && t.to === key);
  if (exists) return 'Cette liaison existe déjà.';
  designer.workflow.transitions.push({ from, to: key, label: '' });
  designer.dirty = true;
  return null;
}

export function dropTransition(index) {
  designer.workflow.transitions.splice(index, 1);
  designer.dirty = true;
}

export function setTransitionLabel(index, label) {
  const transition = designer.workflow.transitions[index];
  if (!transition) return;
  transition.label = label;
  designer.dirty = true;
}

export function openNodeEditor(key) {
  const node = nodeByKey(key);
  if (!node) return;
  const macro = node.macro && typeof node.macro === 'object' ? node.macro : {};
  openModal(`Nœud « ${node.label} »`, `
    <form class="emonos-form" data-node-form="${node.key}">
      <label class="emonos-field"><span>Libellé</span><input name="label" required maxlength="120" value="${escapeHtml(node.label)}" /></label>
      <label class="emonos-field"><span>Type</span><select name="kind">${optionList(NODE_KIND_LABELS, node.kind)}</select></label>
      <fieldset class="emonos-fieldset">
        <legend>Macro « sous-tâche »</legend>
        <p class="emonos-form-hint">Sur un nœud de type Sous-tâche, le moteur crée cette tâche dans le projet à l’entrée du nœud.</p>
        <div class="emonos-field-row">
          <label class="emonos-field"><span>Titre de la sous-tâche</span><input name="macroTitle" maxlength="200" value="${escapeHtml(macro.title || '')}" /></label>
          <label class="emonos-field"><span>Priorité</span><select name="macroPriority">${optionList(PRIORITY_LABELS, macro.priority || 'NORMAL')}</select></label>
        </div>
      </fieldset>
      <footer class="emonos-form-actions">
        <button type="button" class="emonos-btn is-danger" data-action="wf-drop-node" data-key="${node.key}">Supprimer le nœud</button>
        <button type="button" class="emonos-btn is-ghost" data-modal-close>Annuler</button>
        <button type="submit" class="emonos-btn is-primary">Appliquer</button>
      </footer>
    </form>`);
}

export function applyNodeForm(form) {
  const node = nodeByKey(form.dataset.nodeForm);
  if (!node) return false;
  const data = readForm(form);
  if (!data.label) {
    modalError('Le libellé est obligatoire.');
    return false;
  }
  node.label = data.label;
  node.kind = data.kind;
  node.macro = {
    ...(node.macro && typeof node.macro === 'object' ? node.macro : {}),
    title: data.macroTitle || null,
    priority: data.macroPriority || 'NORMAL',
  };
  designer.dirty = true;
  closeModal();
  return true;
}

export function dropNode(key) {
  const workflow = designer.workflow;
  workflow.nodes = workflow.nodes.filter((n) => n.key !== key);
  workflow.transitions = workflow.transitions.filter((t) => t.from !== key && t.to !== key);
  designer.dirty = true;
  closeModal();
}

export async function saveDesigner() {
  const workflow = designer.workflow;
  if (!workflow) return false;
  const result = await emonos.saveWorkflow(workflow.id, {
    description: workflow.description,
    nodes: workflow.nodes.map(({ key, kind, label, x, y, macro }) => ({ key, kind, label, x, y, macro })),
    transitions: workflow.transitions.map(({ from, to, label }) => ({ from, to, label })),
  });
  if (!result.ok) {
    flash(result.error, 'error');
    return false;
  }
  designer.workflow = result.body.workflow;
  designer.dirty = false;
  flash('Workflow enregistré.', 'success');
  return true;
}

export function openWorkflowCreator() {
  const kinds = { '': 'Graphe vierge', ...KIND_LABELS };
  openModal('Nouveau workflow', `
    <form class="emonos-form" data-workflow-form="new">
      <label class="emonos-field"><span>Nom <em>*</em></span><input name="name" required maxlength="120" /></label>
      <label class="emonos-field"><span>Description</span><textarea name="description" rows="3"></textarea></label>
      <label class="emonos-field">
        <span>Point de départ</span>
        <select name="fromKind">${optionList(kinds, '')}</select>
      </label>
      <footer class="emonos-form-actions">
        <button type="button" class="emonos-btn is-ghost" data-modal-close>Annuler</button>
        <button type="submit" class="emonos-btn is-primary">Créer</button>
      </footer>
    </form>`);
}

export async function submitWorkflowForm(form) {
  const data = readForm(form);
  const result = await emonos.createWorkflow({
    name: data.name,
    description: data.description,
    fromKind: data.fromKind || null,
    projectKind: data.fromKind || null,
  });
  if (!result.ok) {
    modalError(result.error);
    return false;
  }
  closeModal();
  state.workflowId = result.body.workflow.id;
  flash('Workflow créé.', 'success');
  return true;
}
