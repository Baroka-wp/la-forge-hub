/**
 * EMONOS — projets (« Project management » du deck) : liste groupée, assistant de
 * création en quatre étapes, arborescence, timeline et corbeille.
 */
import { prisma } from './_lib/prisma.js';
import { requireUser } from './_lib/auth.js';
import { readJsonBody, sendJson, setCors } from './_lib/http.js';
import {
  BLUEPRINTS,
  blueprintFor,
  blueprintSummaries,
  flattenBlueprintTasks,
} from './_lib/emonos-blueprints.js';
import {
  DAY_MS,
  enums,
  isDescendant,
  optionalDate,
  optionalText,
  parseBool,
  projectInclude,
  query,
  requireProject,
  serializeProject,
  text,
  visibleProjectIds,
} from './_lib/emonos.js';

const GROUP_KEYS = { priority: 'priority', owner: 'owner', stage: 'stage' };

/** GET /api/emonos/bootstrap — tout ce dont l'interface a besoin au démarrage. */
export async function bootstrap(req, res) {
  setCors(res);
  try {
    const auth = await requireUser(req);
    if (auth.error) return sendJson(res, auth.status, { error: auth.error });
    const ids = await visibleProjectIds(auth.user);
    const where = ids === null ? {} : { id: { in: ids } };
    const [projects, teams, templates, workflows] = await Promise.all([
      prisma.taskProject.findMany({ where, include: projectInclude, orderBy: { createdAt: 'asc' } }),
      prisma.team.findMany({
        orderBy: { name: 'asc' },
        include: { _count: { select: { members: true, projects: true } } },
      }),
      prisma.documentTemplate.findMany({ orderBy: [{ category: 'asc' }, { name: 'asc' }] }),
      prisma.workflow.findMany({
        orderBy: { name: 'asc' },
        include: { _count: { select: { nodes: true, runs: true } } },
      }),
    ]);
    return sendJson(res, 200, {
      user: auth.user,
      blueprints: blueprintSummaries(),
      projects: projects.map(serializeProject),
      teams: teams.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        memberCount: t._count.members,
        projectCount: t._count.projects,
      })),
      templates: templates.map((t) => ({
        id: t.id,
        name: t.name,
        category: t.category,
        projectKind: t.projectKind,
        description: t.description,
      })),
      workflows: workflows.map((w) => ({
        id: w.id,
        name: w.name,
        description: w.description,
        projectKind: w.projectKind,
        nodeCount: w._count.nodes,
        runCount: w._count.runs,
      })),
    });
  } catch (error) {
    console.error('[emonos:bootstrap]', error);
    return sendJson(res, 500, { error: 'Erreur serveur' });
  }
}

/** GET /api/emonos/projects?scope=all|mine&groupBy=priority|owner|stage&archived=0 */
export async function listProjects(req, res) {
  setCors(res);
  try {
    const auth = await requireUser(req);
    if (auth.error) return sendJson(res, auth.status, { error: auth.error });
    const q = query(req);
    const ids = await visibleProjectIds(auth.user);
    /** @type {Record<string, unknown>} */
    const where = ids === null ? {} : { id: { in: ids } };
    where.archived = parseBool(q.archived) ?? false;
    if (q.scope === 'mine') where.ownerId = auth.user.id;
    const stage = enums.stage(q.stage, null);
    if (stage) where.stage = stage;
    const kind = enums.kind(q.kind, null);
    if (kind) where.kind = kind;
    if (q.parentId === 'root') where.parentId = null;
    else if (q.parentId) where.parentId = String(q.parentId);
    const search = optionalText(q.q, 120);
    if (search) where.name = { contains: search, mode: 'insensitive' };

    const projects = await prisma.taskProject.findMany({
      where,
      include: projectInclude,
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });
    const rows = projects.map(serializeProject);
    const groupBy = GROUP_KEYS[q.groupBy] || null;
    return sendJson(res, 200, { projects: rows, groupBy, groups: groupBy ? groupProjects(rows, groupBy) : null });
  } catch (error) {
    console.error('[emonos:projects:list]', error);
    return sendJson(res, 500, { error: 'Erreur serveur' });
  }
}

function groupProjects(rows, groupBy) {
  const buckets = new Map();
  rows.forEach((project) => {
    const key =
      groupBy === 'owner'
        ? project.owner?.id || 'none'
        : groupBy === 'stage'
          ? project.stage
          : project.priority;
    const label =
      groupBy === 'owner'
        ? project.owner?.displayName || 'Sans responsable'
        : key;
    if (!buckets.has(key)) buckets.set(key, { key, label, projects: [] });
    buckets.get(key).projects.push(project);
  });
  return [...buckets.values()];
}

/** GET /api/emonos/projects/:id */
export async function getProject(req, res) {
  setCors(res);
  try {
    const access = await requireProject(req, req.params?.id);
    if (access.error) return sendJson(res, access.status, { error: access.error });
    const [full, members, documents, run] = await Promise.all([
      prisma.taskProject.findUnique({ where: { id: access.project.id }, include: projectInclude }),
      prisma.taskProjectMember.findMany({
        where: { projectId: access.project.id },
        include: { user: { select: { id: true, displayName: true, email: true } } },
      }),
      prisma.projectDocument.findMany({
        where: { projectId: access.project.id },
        orderBy: { createdAt: 'asc' },
        select: { id: true, title: true, templateId: true, updatedAt: true },
      }),
      prisma.workflowRun.findFirst({
        where: { projectId: access.project.id, status: 'RUNNING' },
        include: {
          workflow: { select: { id: true, name: true } },
          currentNode: { select: { id: true, key: true, label: true, kind: true } },
        },
      }),
    ]);
    const counts = await prisma.task.groupBy({
      by: ['state'],
      where: { projectId: access.project.id, archived: false },
      _count: { _all: true },
    });
    return sendJson(res, 200, {
      project: serializeProject(full),
      role: access.role,
      members: members.map((m) => ({ role: m.role, user: m.user })),
      documents,
      run: run
        ? {
            id: run.id,
            status: run.status,
            workflow: run.workflow,
            currentNode: run.currentNode,
            startedAt: run.startedAt,
          }
        : null,
      taskStates: Object.fromEntries(counts.map((c) => [c.state, c._count._all])),
    });
  } catch (error) {
    console.error('[emonos:projects:get]', error);
    return sendJson(res, 500, { error: 'Erreur serveur' });
  }
}

/**
 * POST /api/emonos/projects — assistant en quatre étapes du deck :
 * nom / projet parent / notes, puis type, puis dates, puis équipe.
 */
export async function createProject(req, res) {
  setCors(res);
  try {
    const auth = await requireUser(req);
    if (auth.error) return sendJson(res, auth.status, { error: auth.error });
    const body = await readJsonBody(req);

    const name = text(body.name, 160);
    if (!name) return sendJson(res, 400, { error: 'Nom de projet requis (160 caractères max.)' });
    const notes = optionalText(body.notes, 5_000);
    if (notes === undefined) return sendJson(res, 400, { error: 'Notes invalides' });
    const kind = enums.kind(body.kind);
    if (!kind) return sendJson(res, 400, { error: 'Type de projet inconnu' });
    const dateMode = enums.dateMode(body.dateMode);
    if (!dateMode) return sendJson(res, 400, { error: 'Mode de dates inconnu' });
    const priority = enums.priority(body.priority);
    if (!priority) return sendJson(res, 400, { error: 'Priorité inconnue' });

    let parentId = null;
    if (body.parentId) {
      const parentAccess = await requireProject(req, body.parentId, { write: true });
      if (parentAccess.error) return sendJson(res, parentAccess.status, { error: 'Projet parent inaccessible' });
      parentId = parentAccess.project.id;
    }

    const blueprint = blueprintFor(kind);
    const dates = resolveDates({ dateMode, body, blueprint });
    if (dates.error) return sendJson(res, 400, { error: dates.error });

    const team = await resolveTeam(body.teamId);
    if (team === undefined) return sendJson(res, 400, { error: 'Équipe inconnue' });

    const project = await prisma.taskProject.create({
      data: {
        name,
        notes,
        kind,
        priority,
        parentId,
        ownerId: auth.user.id,
        teamId: team?.id ?? null,
        dateMode,
        startDate: dates.startDate,
        dueDate: dates.dueDate,
        stage: blueprint.defaultStage,
        members: { create: { userId: auth.user.id, role: 'OWNER' } },
      },
    });

    const applyBlueprint = body.applyBlueprint !== false;
    let created = { tasks: 0, documents: 0 };
    if (applyBlueprint) {
      created = await applyBlueprintToProject(project, blueprint);
    }
    if (team) await copyTeamMembers(project.id, team.id);
    const run = applyBlueprint ? await startBlueprintWorkflow(project, blueprint, auth.user.id) : null;

    const full = await prisma.taskProject.findUnique({ where: { id: project.id }, include: projectInclude });
    return sendJson(res, 201, {
      project: serializeProject(full),
      created: { ...created, workflowRunId: run?.id || null },
    });
  } catch (error) {
    console.error('[emonos:projects:create]', error);
    return sendJson(res, 500, { error: 'Erreur serveur' });
  }
}

/** Étape « Project dates » : sans date, dates fixes, ou automatique depuis le modèle. */
function resolveDates({ dateMode, body, blueprint }) {
  if (dateMode === 'NONE') return { startDate: null, dueDate: null };
  if (dateMode === 'AUTOMATIC') {
    const start = optionalDate(body.startDate) || new Date();
    if (start === undefined) return { error: 'Date de début invalide' };
    return { startDate: start, dueDate: new Date(start.getTime() + blueprint.durationDays * DAY_MS) };
  }
  const startDate = optionalDate(body.startDate);
  const dueDate = optionalDate(body.dueDate);
  if (startDate === undefined || dueDate === undefined) return { error: 'Dates invalides' };
  if (!startDate) return { error: 'Date de début requise' };
  if (dueDate && dueDate < startDate) return { error: 'La date de fin précède la date de début' };
  return { startDate, dueDate };
}

/** Étape « Team » : `auto` choisit l'équipe la moins chargée. */
async function resolveTeam(teamId) {
  if (!teamId || teamId === 'none') return null;
  if (teamId === 'auto') {
    const teams = await prisma.team.findMany({
      include: { _count: { select: { projects: true, members: true } } },
    });
    const staffed = teams.filter((t) => t._count.members > 0);
    const pool = staffed.length ? staffed : teams;
    if (!pool.length) return null;
    return pool.sort((a, b) => a._count.projects - b._count.projects)[0];
  }
  const team = await prisma.team.findUnique({ where: { id: String(teamId) } });
  return team || undefined;
}

async function copyTeamMembers(projectId, teamId) {
  const members = await prisma.teamMember.findMany({ where: { teamId }, select: { userId: true, role: true } });
  if (!members.length) return;
  await prisma.taskProjectMember.createMany({
    data: members.map((m) => ({ projectId, userId: m.userId, role: m.role })),
    skipDuplicates: true,
  });
}

/** Déploie l'arborescence de tâches et les documents du modèle sur un projet neuf. */
export async function applyBlueprintToProject(project, blueprint) {
  const rows = flattenBlueprintTasks(blueprint.tasks);
  const idByKey = new Map();
  const base = project.startDate ? project.startDate.getTime() : null;
  for (const row of rows) {
    const created = await prisma.task.create({
      data: {
        projectId: project.id,
        parentId: row.parentKey ? idByKey.get(row.parentKey) || null : null,
        title: row.title,
        path: row.path,
        position: row.position,
        priority: row.priority,
        startDate: base === null ? null : new Date(base + row.offsetDays * DAY_MS),
        dueDate: base === null ? null : new Date(base + (row.offsetDays + row.durationDays) * DAY_MS),
        eventDashboard: row.eventDashboard,
        eventConfigure: row.eventConfigure,
      },
      select: { id: true },
    });
    idByKey.set(row.key, created.id);
  }

  let documents = 0;
  for (const doc of blueprint.documents) {
    const template = await prisma.documentTemplate.upsert({
      where: { name_category: { name: doc.name, category: doc.category } },
      update: {},
      create: {
        name: doc.name,
        category: doc.category,
        projectKind: blueprint.kind,
        bodyMarkdown: doc.body,
      },
    });
    await prisma.projectDocument.create({
      data: {
        projectId: project.id,
        templateId: template.id,
        title: doc.name,
        bodyMarkdown: doc.body,
      },
    });
    documents += 1;
  }
  return { tasks: rows.length, documents };
}

/** Crée (si besoin) le workflow du type de projet, puis démarre une exécution. */
export async function startBlueprintWorkflow(project, blueprint, actorId) {
  const workflow = await ensureWorkflow(blueprint);
  const startNode = await prisma.workflowNode.findFirst({
    where: { workflowId: workflow.id, kind: 'START' },
    select: { id: true },
  });
  const run = await prisma.workflowRun.create({
    data: {
      workflowId: workflow.id,
      projectId: project.id,
      currentNodeId: startNode?.id || null,
      logs: startNode ? { create: { nodeId: startNode.id, note: 'Démarrage du workflow', actorId } } : undefined,
    },
    select: { id: true },
  });
  return run;
}

/** Le workflow d'un type de projet est unique et partagé : le designer l'édite ensuite. */
export async function ensureWorkflow(blueprint) {
  const existing = await prisma.workflow.findUnique({ where: { name: blueprint.workflow.name } });
  if (existing) return existing;
  const workflow = await prisma.workflow.create({
    data: {
      name: blueprint.workflow.name,
      description: blueprint.workflow.description,
      projectKind: blueprint.kind,
    },
  });
  const nodeIds = new Map();
  for (const node of blueprint.workflow.nodes) {
    const created = await prisma.workflowNode.create({
      data: {
        workflowId: workflow.id,
        key: node.key,
        kind: node.kind,
        label: node.label,
        x: node.x,
        y: node.y,
        macro: node.macro ? { ...node.macro, stage: blueprint.workflow.stageByNode?.[node.key] || null } : { stage: blueprint.workflow.stageByNode?.[node.key] || null },
      },
      select: { id: true },
    });
    nodeIds.set(node.key, created.id);
  }
  for (const transition of blueprint.workflow.transitions) {
    await prisma.workflowTransition.create({
      data: {
        workflowId: workflow.id,
        fromNodeId: nodeIds.get(transition.from),
        toNodeId: nodeIds.get(transition.to),
        label: transition.label || '',
      },
    });
  }
  return workflow;
}

/** PATCH /api/emonos/projects/:id */
export async function patchProject(req, res) {
  setCors(res);
  try {
    const access = await requireProject(req, req.params?.id, { write: true });
    if (access.error) return sendJson(res, access.status, { error: access.error });
    const body = await readJsonBody(req);
    /** @type {Record<string, unknown>} */
    const data = {};

    if (body.name !== undefined) {
      const name = text(body.name, 160);
      if (!name) return sendJson(res, 400, { error: 'Nom de projet invalide' });
      data.name = name;
    }
    if (body.notes !== undefined) {
      const notes = optionalText(body.notes, 5_000);
      if (notes === undefined) return sendJson(res, 400, { error: 'Notes invalides' });
      data.notes = notes;
    }
    for (const [field, parse] of [['kind', enums.kind], ['stage', enums.stage], ['priority', enums.priority], ['dateMode', enums.dateMode]]) {
      if (body[field] === undefined) continue;
      const value = parse(body[field], null);
      if (!value) return sendJson(res, 400, { error: `Valeur invalide pour ${field}` });
      data[field] = value;
    }
    for (const field of ['startDate', 'dueDate']) {
      if (body[field] === undefined) continue;
      const value = optionalDate(body[field]);
      if (value === undefined) return sendJson(res, 400, { error: `Date invalide pour ${field}` });
      data[field] = value;
    }
    if (body.archived !== undefined) {
      const archived = parseBool(body.archived);
      if (archived === null) return sendJson(res, 400, { error: 'Valeur archived invalide' });
      data.archived = archived;
    }
    if (body.teamId !== undefined) {
      const team = await resolveTeam(body.teamId);
      if (team === undefined) return sendJson(res, 400, { error: 'Équipe inconnue' });
      data.teamId = team?.id ?? null;
    }
    if (body.parentId !== undefined) {
      if (!body.parentId) data.parentId = null;
      else {
        const parentAccess = await requireProject(req, body.parentId, { write: true });
        if (parentAccess.error) return sendJson(res, 400, { error: 'Projet parent inaccessible' });
        if (parentAccess.project.id === access.project.id) {
          return sendJson(res, 400, { error: 'Un projet ne peut pas être son propre parent' });
        }
        if (await isDescendant(prisma.taskProject, parentAccess.project.id, access.project.id)) {
          return sendJson(res, 400, { error: 'Déplacement impossible : le parent visé est un sous-projet' });
        }
        data.parentId = parentAccess.project.id;
      }
    }
    const start = data.startDate ?? access.project.startDate;
    const due = data.dueDate ?? access.project.dueDate;
    if (start && due && due < start) return sendJson(res, 400, { error: 'La date de fin précède la date de début' });

    const updated = await prisma.taskProject.update({
      where: { id: access.project.id },
      data,
      include: projectInclude,
    });
    return sendJson(res, 200, { project: serializeProject(updated) });
  } catch (error) {
    console.error('[emonos:projects:patch]', error);
    return sendJson(res, 500, { error: 'Erreur serveur' });
  }
}

/** DELETE /api/emonos/projects/:id — supprime le projet et sa descendance. */
export async function deleteProject(req, res) {
  setCors(res);
  try {
    const access = await requireProject(req, req.params?.id, { administer: true });
    if (access.error) return sendJson(res, access.status, { error: access.error });
    await prisma.taskProject.delete({ where: { id: access.project.id } });
    return sendJson(res, 200, { deleted: true });
  } catch (error) {
    console.error('[emonos:projects:delete]', error);
    return sendJson(res, 500, { error: 'Erreur serveur' });
  }
}

/**
 * GET /api/emonos/projects/:id/timeline — barres de Gantt (projet + tâches datées),
 * équivalent de la vue « Project Timeline » du deck.
 */
export async function projectTimeline(req, res) {
  setCors(res);
  try {
    const access = await requireProject(req, req.params?.id);
    if (access.error) return sendJson(res, access.status, { error: access.error });
    const tasks = await prisma.task.findMany({
      where: { projectId: access.project.id, archived: false },
      orderBy: [{ path: 'asc' }, { position: 'asc' }],
      select: {
        id: true, parentId: true, title: true, path: true, state: true, priority: true,
        startDate: true, dueDate: true, progress: true,
      },
    });
    const dated = tasks.filter((t) => t.startDate && t.dueDate);
    const bounds = dated.reduce(
      (acc, t) => ({
        start: !acc.start || t.startDate < acc.start ? t.startDate : acc.start,
        end: !acc.end || t.dueDate > acc.end ? t.dueDate : acc.end,
      }),
      { start: access.project.startDate, end: access.project.dueDate },
    );
    return sendJson(res, 200, {
      project: { id: access.project.id, name: access.project.name, startDate: access.project.startDate, dueDate: access.project.dueDate },
      window: bounds,
      tasks,
    });
  } catch (error) {
    console.error('[emonos:projects:timeline]', error);
    return sendJson(res, 500, { error: 'Erreur serveur' });
  }
}

/** GET /api/emonos/blueprints — catalogue des types de projet (étape 2 de l'assistant). */
export async function listBlueprints(req, res) {
  setCors(res);
  try {
    const auth = await requireUser(req);
    if (auth.error) return sendJson(res, auth.status, { error: auth.error });
    return sendJson(res, 200, { blueprints: blueprintSummaries(), count: BLUEPRINTS.length });
  } catch (error) {
    console.error('[emonos:blueprints]', error);
    return sendJson(res, 500, { error: 'Erreur serveur' });
  }
}
