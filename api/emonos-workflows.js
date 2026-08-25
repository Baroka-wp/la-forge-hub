/**
 * EMONOS — moteur et concepteur de workflow.
 *
 * Le concepteur enregistre un graphe (nœuds + transitions) ; le moteur fait avancer
 * une exécution rattachée à un projet. Deux types de nœuds portent une logique :
 *  - DECISION : la transition à emprunter est choisie par son étiquette (« GO » / « NO GO ») ;
 *  - SUBTASK : nœud embarqué du deck, il instancie une sous-tâche du projet (macro).
 */
import { prisma } from './_lib/prisma.js';
import { requireUser } from './_lib/auth.js';
import { readJsonBody, sendJson, setCors } from './_lib/http.js';
import { NODE_KINDS, blueprintFor } from './_lib/emonos-blueprints.js';
import {
  childPath,
  enums,
  optionalText,
  query,
  requireProject,
  serializeTask,
  taskInclude,
  text,
} from './_lib/emonos.js';
import { ensureWorkflow } from './emonos-projects.js';

const graphInclude = {
  nodes: { orderBy: { x: 'asc' } },
  transitions: true,
};

/** GET /api/emonos/workflows */
export async function listWorkflows(req, res) {
  setCors(res);
  try {
    const auth = await requireUser(req);
    if (auth.error) return sendJson(res, auth.status, { error: auth.error });
    const workflows = await prisma.workflow.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { nodes: true, transitions: true, runs: true } } },
    });
    return sendJson(res, 200, {
      workflows: workflows.map((w) => ({
        id: w.id,
        name: w.name,
        description: w.description,
        projectKind: w.projectKind,
        nodeCount: w._count.nodes,
        transitionCount: w._count.transitions,
        runCount: w._count.runs,
        updatedAt: w.updatedAt,
      })),
    });
  } catch (error) {
    console.error('[emonos:workflows:list]', error);
    return sendJson(res, 500, { error: 'Erreur serveur' });
  }
}

/** GET /api/emonos/workflows/:id — graphe complet pour le concepteur. */
export async function getWorkflow(req, res) {
  setCors(res);
  try {
    const auth = await requireUser(req);
    if (auth.error) return sendJson(res, auth.status, { error: auth.error });
    const workflow = await prisma.workflow.findUnique({
      where: { id: String(req.params?.id || '') },
      include: graphInclude,
    });
    if (!workflow) return sendJson(res, 404, { error: 'Workflow introuvable' });
    return sendJson(res, 200, { workflow: serializeWorkflow(workflow), nodeKinds: NODE_KINDS });
  } catch (error) {
    console.error('[emonos:workflows:get]', error);
    return sendJson(res, 500, { error: 'Erreur serveur' });
  }
}

function serializeWorkflow(workflow) {
  const keyById = new Map(workflow.nodes.map((n) => [n.id, n.key]));
  return {
    id: workflow.id,
    name: workflow.name,
    description: workflow.description,
    projectKind: workflow.projectKind,
    nodes: workflow.nodes.map((n) => ({
      id: n.id, key: n.key, kind: n.kind, label: n.label, x: n.x, y: n.y, macro: n.macro,
    })),
    transitions: workflow.transitions.map((t) => ({
      id: t.id,
      label: t.label,
      from: keyById.get(t.fromNodeId) || null,
      to: keyById.get(t.toNodeId) || null,
    })),
  };
}

/** POST /api/emonos/workflows — nouveau graphe, éventuellement issu d'un modèle. */
export async function createWorkflow(req, res) {
  setCors(res);
  try {
    const auth = await requireUser(req);
    if (auth.error) return sendJson(res, auth.status, { error: auth.error });
    const body = await readJsonBody(req);
    const name = text(body.name, 120);
    if (!name) return sendJson(res, 400, { error: 'Nom de workflow requis' });
    const description = optionalText(body.description, 2_000);
    if (description === undefined) return sendJson(res, 400, { error: 'Description invalide' });
    const projectKind = body.projectKind ? enums.kind(body.projectKind, null) : null;
    if (body.projectKind && !projectKind) return sendJson(res, 400, { error: 'Type de projet inconnu' });
    const existing = await prisma.workflow.findUnique({ where: { name }, select: { id: true } });
    if (existing) return sendJson(res, 409, { error: 'Un workflow porte déjà ce nom' });

    const workflow = await prisma.workflow.create({ data: { name, description, projectKind } });
    const seed = body.fromKind ? blueprintFor(body.fromKind).workflow : null;
    const graph = seed
      ? { nodes: seed.nodes, transitions: seed.transitions }
      : {
          nodes: [
            { key: 'start', kind: 'START', label: 'Début', x: 60, y: 180 },
            { key: 'step-1', kind: 'STEP', label: 'Étape', x: 260, y: 180 },
            { key: 'end', kind: 'END', label: 'Fin', x: 480, y: 180 },
          ],
          transitions: [
            { from: 'start', to: 'step-1', label: '' },
            { from: 'step-1', to: 'end', label: '' },
          ],
        };
    await writeGraph(workflow.id, graph);
    const full = await prisma.workflow.findUnique({ where: { id: workflow.id }, include: graphInclude });
    return sendJson(res, 201, { workflow: serializeWorkflow(full) });
  } catch (error) {
    console.error('[emonos:workflows:create]', error);
    return sendJson(res, 500, { error: 'Erreur serveur' });
  }
}

/**
 * PUT /api/emonos/workflows/:id — enregistre le graphe édité dans le concepteur.
 * Les nœuds sont identifiés par leur `key` : ceux qui subsistent gardent leur ligne,
 * donc les exécutions en cours restent rattachées à leur étape.
 */
export async function saveWorkflow(req, res) {
  setCors(res);
  try {
    const auth = await requireUser(req);
    if (auth.error) return sendJson(res, auth.status, { error: auth.error });
    const workflow = await prisma.workflow.findUnique({
      where: { id: String(req.params?.id || '') },
      include: graphInclude,
    });
    if (!workflow) return sendJson(res, 404, { error: 'Workflow introuvable' });

    const body = await readJsonBody(req);
    const validation = validateGraph(body);
    if (validation.error) return sendJson(res, 400, { error: validation.error });

    if (body.name !== undefined || body.description !== undefined) {
      const data = {};
      if (body.name !== undefined) {
        const name = text(body.name, 120);
        if (!name) return sendJson(res, 400, { error: 'Nom de workflow invalide' });
        const clash = await prisma.workflow.findFirst({ where: { name, NOT: { id: workflow.id } }, select: { id: true } });
        if (clash) return sendJson(res, 409, { error: 'Un workflow porte déjà ce nom' });
        data.name = name;
      }
      if (body.description !== undefined) {
        const description = optionalText(body.description, 2_000);
        if (description === undefined) return sendJson(res, 400, { error: 'Description invalide' });
        data.description = description;
      }
      await prisma.workflow.update({ where: { id: workflow.id }, data });
    }

    await writeGraph(workflow.id, validation.graph, workflow);
    const full = await prisma.workflow.findUnique({ where: { id: workflow.id }, include: graphInclude });
    return sendJson(res, 200, { workflow: serializeWorkflow(full) });
  } catch (error) {
    console.error('[emonos:workflows:save]', error);
    return sendJson(res, 500, { error: 'Erreur serveur' });
  }
}

function validateGraph(body) {
  const nodes = Array.isArray(body.nodes) ? body.nodes : null;
  const transitions = Array.isArray(body.transitions) ? body.transitions : [];
  if (!nodes?.length) return { error: 'Le workflow doit contenir au moins un nœud' };
  if (nodes.length > 200) return { error: 'Trop de nœuds (200 maximum)' };

  const keys = new Set();
  const clean = [];
  for (const node of nodes) {
    const key = text(node.key, 60);
    const label = text(node.label, 120);
    if (!key || !label) return { error: 'Chaque nœud exige une clé et un libellé' };
    if (!/^[a-z0-9][a-z0-9-]*$/i.test(key)) return { error: `Clé de nœud invalide : ${key}` };
    if (keys.has(key)) return { error: `Clé de nœud dupliquée : ${key}` };
    keys.add(key);
    if (!NODE_KINDS.includes(node.kind)) return { error: `Type de nœud inconnu : ${node.kind}` };
    const x = Number(node.x);
    const y = Number(node.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return { error: 'Coordonnées de nœud invalides' };
    clean.push({
      key,
      label,
      kind: node.kind,
      x: Math.round(x),
      y: Math.round(y),
      macro: node.macro && typeof node.macro === 'object' ? node.macro : null,
    });
  }
  if (clean.filter((n) => n.kind === 'START').length !== 1) {
    return { error: 'Le workflow doit contenir exactement un nœud de départ' };
  }

  const seen = new Set();
  const cleanTransitions = [];
  for (const transition of transitions) {
    const from = text(transition.from, 60);
    const to = text(transition.to, 60);
    if (!from || !to) return { error: 'Transition incomplète' };
    if (!keys.has(from) || !keys.has(to)) return { error: `Transition vers un nœud inconnu : ${from} → ${to}` };
    const label = transition.label ? text(transition.label, 60) : '';
    if (transition.label && !label) return { error: 'Étiquette de transition invalide' };
    const signature = `${from}>${to}>${label || ''}`;
    if (seen.has(signature)) return { error: 'Transition dupliquée' };
    seen.add(signature);
    cleanTransitions.push({ from, to, label: label || '' });
  }
  for (const node of clean) {
    if (node.kind !== 'DECISION') continue;
    const branches = cleanTransitions.filter((t) => t.from === node.key);
    if (branches.length < 2) return { error: `Le nœud de décision « ${node.label} » exige au moins deux branches` };
    if (branches.some((t) => !t.label)) return { error: `Chaque branche de « ${node.label} » doit porter une étiquette` };
  }
  return { graph: { nodes: clean, transitions: cleanTransitions } };
}

/** Écrit le graphe en conservant les nœuds dont la clé n'a pas changé. */
async function writeGraph(workflowId, graph, previous = null) {
  const existingNodes = previous
    ? previous.nodes
    : await prisma.workflowNode.findMany({ where: { workflowId } });
  const byKey = new Map(existingNodes.map((n) => [n.key, n]));
  const keptKeys = new Set(graph.nodes.map((n) => n.key));

  await prisma.workflowTransition.deleteMany({ where: { workflowId } });
  const removed = existingNodes.filter((n) => !keptKeys.has(n.key)).map((n) => n.id);
  if (removed.length) await prisma.workflowNode.deleteMany({ where: { id: { in: removed } } });

  const idByKey = new Map();
  for (const node of graph.nodes) {
    const current = byKey.get(node.key);
    const data = { kind: node.kind, label: node.label, x: node.x, y: node.y, macro: node.macro ?? undefined };
    const row = current
      ? await prisma.workflowNode.update({ where: { id: current.id }, data, select: { id: true } })
      : await prisma.workflowNode.create({ data: { workflowId, key: node.key, ...data }, select: { id: true } });
    idByKey.set(node.key, row.id);
  }
  for (const transition of graph.transitions) {
    await prisma.workflowTransition.create({
      data: {
        workflowId,
        fromNodeId: idByKey.get(transition.from),
        toNodeId: idByKey.get(transition.to),
        label: transition.label,
      },
    });
  }
}

/** GET /api/emonos/runs?projectId= — exécutions d'un projet, avec leur journal. */
export async function listRuns(req, res) {
  setCors(res);
  try {
    const q = query(req);
    const access = await requireProject(req, q.projectId);
    if (access.error) return sendJson(res, access.status, { error: access.error });
    const runs = await prisma.workflowRun.findMany({
      where: { projectId: access.project.id },
      orderBy: { startedAt: 'desc' },
      include: {
        workflow: { select: { id: true, name: true } },
        currentNode: { select: { id: true, key: true, label: true, kind: true } },
        logs: {
          orderBy: { createdAt: 'asc' },
          include: {
            node: { select: { key: true, label: true, kind: true } },
            actor: { select: { id: true, displayName: true } },
            task: { select: { id: true, title: true } },
          },
        },
      },
    });
    const withOptions = await Promise.all(
      runs.map(async (run) => ({
        id: run.id,
        status: run.status,
        startedAt: run.startedAt,
        endedAt: run.endedAt,
        workflow: run.workflow,
        currentNode: run.currentNode,
        options: run.status === 'RUNNING' && run.currentNodeId ? await branchOptions(run.currentNodeId) : [],
        logs: run.logs,
      })),
    );
    return sendJson(res, 200, { runs: withOptions });
  } catch (error) {
    console.error('[emonos:runs:list]', error);
    return sendJson(res, 500, { error: 'Erreur serveur' });
  }
}

async function branchOptions(nodeId) {
  const transitions = await prisma.workflowTransition.findMany({
    where: { fromNodeId: nodeId },
    include: { to: { select: { key: true, label: true, kind: true } } },
  });
  return transitions.map((t) => ({ label: t.label, to: t.to }));
}

/** POST /api/emonos/projects/:id/workflow — démarre (ou redémarre) une exécution. */
export async function startRun(req, res) {
  setCors(res);
  try {
    const access = await requireProject(req, req.params?.id, { administer: true });
    if (access.error) return sendJson(res, access.status, { error: access.error });
    const body = await readJsonBody(req);

    let workflow;
    if (body.workflowId) {
      workflow = await prisma.workflow.findUnique({ where: { id: String(body.workflowId) } });
      if (!workflow) return sendJson(res, 400, { error: 'Workflow introuvable' });
    } else {
      workflow = await ensureWorkflow(blueprintFor(access.project.kind));
    }
    const startNode = await prisma.workflowNode.findFirst({
      where: { workflowId: workflow.id, kind: 'START' },
      select: { id: true },
    });
    if (!startNode) return sendJson(res, 400, { error: 'Ce workflow n’a pas de nœud de départ' });

    await prisma.workflowRun.updateMany({
      where: { projectId: access.project.id, status: 'RUNNING' },
      data: { status: 'CANCELLED', endedAt: new Date() },
    });
    const run = await prisma.workflowRun.create({
      data: {
        workflowId: workflow.id,
        projectId: access.project.id,
        currentNodeId: startNode.id,
        logs: { create: { nodeId: startNode.id, note: 'Démarrage du workflow', actorId: access.user.id } },
      },
      include: { currentNode: { select: { id: true, key: true, label: true, kind: true } }, workflow: { select: { id: true, name: true } } },
    });
    return sendJson(res, 201, {
      run: { id: run.id, status: run.status, workflow: run.workflow, currentNode: run.currentNode },
      options: await branchOptions(startNode.id),
    });
  } catch (error) {
    console.error('[emonos:runs:start]', error);
    return sendJson(res, 500, { error: 'Erreur serveur' });
  }
}

/**
 * POST /api/emonos/runs/:id/advance — franchit une transition.
 * Sur un nœud DECISION, `decision` doit nommer la branche (« GO », « NO GO »…).
 */
export async function advanceRun(req, res) {
  setCors(res);
  try {
    const auth = await requireUser(req);
    if (auth.error) return sendJson(res, auth.status, { error: auth.error });
    const run = await prisma.workflowRun.findUnique({
      where: { id: String(req.params?.id || '') },
      include: { currentNode: true },
    });
    if (!run) return sendJson(res, 404, { error: 'Exécution introuvable' });
    const access = await requireProject(req, run.projectId, { write: true });
    if (access.error) return sendJson(res, access.status, { error: access.error });
    if (run.status !== 'RUNNING') return sendJson(res, 409, { error: 'Exécution déjà terminée' });
    if (!run.currentNode) return sendJson(res, 409, { error: 'Exécution sans étape courante' });

    const body = await readJsonBody(req);
    const note = optionalText(body.note, 2_000);
    if (note === undefined) return sendJson(res, 400, { error: 'Note invalide' });

    const transitions = await prisma.workflowTransition.findMany({
      where: { fromNodeId: run.currentNodeId },
      include: { to: true },
    });
    if (!transitions.length) {
      const ended = await prisma.workflowRun.update({
        where: { id: run.id },
        data: { status: 'DONE', endedAt: new Date() },
        include: { currentNode: true },
      });
      return sendJson(res, 200, { run: { id: ended.id, status: ended.status, currentNode: ended.currentNode }, options: [] });
    }

    const decision = body.decision ? text(body.decision, 60) : null;
    if (body.decision && !decision) return sendJson(res, 400, { error: 'Décision invalide' });
    let chosen;
    if (run.currentNode.kind === 'DECISION') {
      if (!decision) {
        return sendJson(res, 400, {
          error: 'Cette étape est une décision : précisez la branche',
          options: transitions.map((t) => t.label),
        });
      }
      chosen = transitions.find((t) => t.label === decision);
      if (!chosen) return sendJson(res, 400, { error: `Branche inconnue : ${decision}`, options: transitions.map((t) => t.label) });
    } else {
      chosen = decision ? transitions.find((t) => t.label === decision) : transitions[0];
      if (!chosen) return sendJson(res, 400, { error: `Branche inconnue : ${decision}` });
    }

    const target = chosen.to;
    /** Nœud SUBTASK : le moteur instancie une sous-tâche du projet (macro du deck). */
    let createdTask = null;
    if (target.kind === 'SUBTASK') createdTask = await instantiateSubtask(access.project, target, auth.user.id);

    const stage = enums.stage(target.macro?.stage, null);
    if (stage) await prisma.taskProject.update({ where: { id: access.project.id }, data: { stage } });

    const isEnd = target.kind === 'END';
    const updated = await prisma.workflowRun.update({
      where: { id: run.id },
      data: {
        currentNodeId: target.id,
        status: isEnd ? 'DONE' : 'RUNNING',
        endedAt: isEnd ? new Date() : null,
        logs: {
          create: {
            nodeId: target.id,
            decision: chosen.label || null,
            note,
            taskId: createdTask?.id || null,
            actorId: auth.user.id,
          },
        },
      },
      include: { currentNode: { select: { id: true, key: true, label: true, kind: true } } },
    });
    return sendJson(res, 200, {
      run: { id: updated.id, status: updated.status, currentNode: updated.currentNode, endedAt: updated.endedAt },
      createdTask,
      stage: stage || null,
      options: isEnd ? [] : await branchOptions(target.id),
    });
  } catch (error) {
    console.error('[emonos:runs:advance]', error);
    return sendJson(res, 500, { error: 'Erreur serveur' });
  }
}

/** Crée la sous-tâche décrite par la macro d'un nœud SUBTASK (idempotent par titre). */
async function instantiateSubtask(project, node, actorId) {
  const macro = node.macro && typeof node.macro === 'object' ? node.macro : {};
  const title = typeof macro.title === 'string' && macro.title.trim() ? macro.title.trim() : node.label;
  const existing = await prisma.task.findFirst({
    where: { projectId: project.id, parentId: null, title },
    include: taskInclude,
  });
  if (existing) return serializeTask(existing);
  const position = await prisma.task.count({ where: { projectId: project.id, parentId: null } });
  const created = await prisma.task.create({
    data: {
      projectId: project.id,
      title,
      path: childPath(null),
      position,
      priority: enums.priority(macro.priority) || 'NORMAL',
      startDate: project.startDate,
      dueDate: project.dueDate,
      events: { create: { action: 'WORKFLOW_SUBTASK', actorId, payload: { node: node.key } } },
    },
    include: taskInclude,
  });
  return serializeTask(created);
}

/** POST /api/emonos/runs/:id/cancel */
export async function cancelRun(req, res) {
  setCors(res);
  try {
    const run = await prisma.workflowRun.findUnique({ where: { id: String(req.params?.id || '') } });
    if (!run) return sendJson(res, 404, { error: 'Exécution introuvable' });
    const access = await requireProject(req, run.projectId, { administer: true });
    if (access.error) return sendJson(res, access.status, { error: access.error });
    if (run.status !== 'RUNNING') return sendJson(res, 409, { error: 'Exécution déjà terminée' });
    const updated = await prisma.workflowRun.update({
      where: { id: run.id },
      data: { status: 'CANCELLED', endedAt: new Date() },
    });
    return sendJson(res, 200, { run: { id: updated.id, status: updated.status, endedAt: updated.endedAt } });
  } catch (error) {
    console.error('[emonos:runs:cancel]', error);
    return sendJson(res, 500, { error: 'Erreur serveur' });
  }
}
