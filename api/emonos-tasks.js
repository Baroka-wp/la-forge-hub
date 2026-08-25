/**
 * EMONOS — tâches (« Tasks management » du deck).
 *
 * Reprend la sémantique des boutons décrits dans la présentation :
 *  - latéraux : ajout, filtre tâches critiques, filtre tâches arrêtées, bascule archives ;
 *  - par tâche : EDIT, OPEN (descendre d'un niveau), DELETE, ARCHIVE, plus les actions
 *    custom DASHBOARD et CONFIGURE, affichées seulement si la propriété
 *    `event_dashboard` / `event_configure` porte une macro.
 */
import { prisma } from './_lib/prisma.js';
import { readJsonBody, sendJson, setCors } from './_lib/http.js';
import { requireUser } from './_lib/auth.js';
import { TASK_MACROS } from './_lib/emonos-blueprints.js';
import {
  DAY_MS,
  childPath,
  enums,
  isDescendant,
  optionalDate,
  optionalInt,
  optionalText,
  parseBool,
  query,
  reindexSubtree,
  requireProject,
  serializeTask,
  taskInclude,
  text,
} from './_lib/emonos.js';

const MAX_PAGE_SIZE = 100;

/** Charge une tâche et vérifie l'accès au projet qui la porte. */
async function requireTask(req, taskId, opts = {}) {
  const id = String(taskId || '').trim();
  if (!id) return { error: 'Tâche introuvable', status: 404 };
  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) return { error: 'Tâche introuvable', status: 404 };
  const access = await requireProject(req, task.projectId, opts);
  if (access.error) return access;
  return { ...access, task };
}

/**
 * GET /api/emonos/tasks
 * Filtres : projectId, parentId (`root` ou identifiant), before (date butoir du deck),
 * critical, stopped, archived, page, pageSize, groupByDay.
 */
export async function listTasks(req, res) {
  setCors(res);
  try {
    const q = query(req);
    const access = await requireProject(req, q.projectId);
    if (access.error) return sendJson(res, access.status, { error: access.error });

    /** @type {Record<string, unknown>} */
    const where = { projectId: access.project.id, archived: parseBool(q.archived) ?? false };
    let parent = null;
    if (q.parentId && q.parentId !== 'root') {
      parent = await prisma.task.findFirst({
        where: { id: String(q.parentId), projectId: access.project.id },
        select: { id: true, title: true, path: true, parentId: true },
      });
      if (!parent) return sendJson(res, 404, { error: 'Tâche parente introuvable' });
      where.parentId = parent.id;
    } else if (q.parentId === 'root') {
      where.parentId = null;
    }
    if (parseBool(q.critical)) where.priority = 'CRITICAL';
    else {
      const priority = enums.priority(q.priority, null);
      if (priority) where.priority = priority;
    }
    if (parseBool(q.stopped)) where.state = 'STOPPED';
    else {
      const state = enums.state(q.state, null);
      if (state) where.state = state;
    }
    const before = optionalDate(q.before);
    if (before === undefined) return sendJson(res, 400, { error: 'Paramètre `before` invalide' });
    if (before) where.dueDate = { lt: before };
    const search = optionalText(q.q, 120);
    if (search) where.title = { contains: search, mode: 'insensitive' };

    const page = Math.max(1, Number(q.page) || 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(q.pageSize) || 20));
    const [total, tasks] = await Promise.all([
      prisma.task.count({ where }),
      prisma.task.findMany({
        where,
        include: taskInclude,
        orderBy: [{ dueDate: 'asc' }, { position: 'asc' }, { createdAt: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    const rows = tasks.map(serializeTask);
    return sendJson(res, 200, {
      tasks: rows,
      /** Le deck empile les tâches par jour d'échéance (« 30 June », « 29 June »). */
      days: groupByDay(rows),
      breadcrumb: parent ? { id: parent.id, title: parent.title, path: childPath(parent), parentId: parent.parentId } : null,
      page,
      pageSize,
      total,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    });
  } catch (error) {
    console.error('[emonos:tasks:list]', error);
    return sendJson(res, 500, { error: 'Erreur serveur' });
  }
}

function groupByDay(rows) {
  const buckets = new Map();
  rows.forEach((task) => {
    const key = task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 10) : 'none';
    if (!buckets.has(key)) buckets.set(key, { day: key === 'none' ? null : key, tasks: [] });
    buckets.get(key).tasks.push(task);
  });
  return [...buckets.values()].sort((a, b) => {
    if (a.day === b.day) return 0;
    if (!a.day) return 1;
    if (!b.day) return -1;
    return a.day < b.day ? 1 : -1;
  });
}

/** POST /api/emonos/tasks — assistant « NEW TASK » du bouton latéral `+`. */
export async function createTask(req, res) {
  setCors(res);
  try {
    const body = await readJsonBody(req);
    const access = await requireProject(req, body.projectId, { write: true });
    if (access.error) return sendJson(res, access.status, { error: access.error });

    const title = text(body.title, 200);
    if (!title) return sendJson(res, 400, { error: 'Titre de tâche requis (200 caractères max.)' });
    const description = optionalText(body.description, 10_000);
    if (description === undefined) return sendJson(res, 400, { error: 'Description invalide' });
    const priority = enums.priority(body.priority);
    if (!priority) return sendJson(res, 400, { error: 'Priorité inconnue' });
    const state = enums.state(body.state);
    if (!state) return sendJson(res, 400, { error: 'État inconnu' });
    const startDate = optionalDate(body.startDate);
    const dueDate = optionalDate(body.dueDate);
    if (startDate === undefined || dueDate === undefined) return sendJson(res, 400, { error: 'Dates invalides' });
    if (startDate && dueDate && dueDate < startDate) {
      return sendJson(res, 400, { error: 'L’échéance précède la date de début' });
    }
    const plannedHours = optionalInt(body.plannedHours, { min: 0, max: 100_000 });
    if (plannedHours === undefined) return sendJson(res, 400, { error: 'Charge planifiée invalide' });
    const macros = readMacros(body);
    if (macros === undefined) return sendJson(res, 400, { error: 'Macro inconnue' });

    let parent = null;
    if (body.parentId) {
      parent = await prisma.task.findFirst({
        where: { id: String(body.parentId), projectId: access.project.id },
        select: { id: true, title: true, path: true },
      });
      if (!parent) return sendJson(res, 400, { error: 'Tâche parente introuvable' });
    }
    const ownerId = await resolveOwner(body.ownerId, access.project.id);
    if (ownerId === undefined) return sendJson(res, 400, { error: 'Responsable hors du projet' });

    const position = await prisma.task.count({
      where: { projectId: access.project.id, parentId: parent?.id ?? null },
    });
    const task = await prisma.task.create({
      data: {
        projectId: access.project.id,
        parentId: parent?.id ?? null,
        title,
        description,
        path: childPath(parent),
        position,
        priority,
        state,
        ownerId,
        startDate,
        dueDate,
        plannedHours,
        ...macros,
        events: { create: { action: 'CREATE', actorId: access.user.id } },
      },
      include: taskInclude,
    });
    return sendJson(res, 201, { task: serializeTask(task) });
  } catch (error) {
    console.error('[emonos:tasks:create]', error);
    return sendJson(res, 500, { error: 'Erreur serveur' });
  }
}

function readMacros(body) {
  const out = {};
  for (const [field, property] of [['eventDashboard', 'event_dashboard'], ['eventConfigure', 'event_configure']]) {
    if (body[field] === undefined) continue;
    const value = optionalText(body[field], 80);
    if (value === undefined) return undefined;
    if (value && !TASK_MACROS[property].includes(value)) return undefined;
    out[field] = value;
  }
  return out;
}

async function resolveOwner(ownerId, projectId) {
  if (ownerId === null || ownerId === undefined || ownerId === '') return null;
  const member = await prisma.taskProjectMember.findUnique({
    where: { projectId_userId: { projectId, userId: String(ownerId) } },
    select: { userId: true },
  });
  return member ? member.userId : undefined;
}

/** PATCH /api/emonos/tasks/:id — action EDIT, plus état, dates et rattachement. */
export async function patchTask(req, res) {
  setCors(res);
  try {
    const access = await requireTask(req, req.params?.id, { write: true });
    if (access.error) return sendJson(res, access.status, { error: access.error });
    const body = await readJsonBody(req);
    /** @type {Record<string, unknown>} */
    const data = {};
    let renamed = false;

    if (body.title !== undefined) {
      const title = text(body.title, 200);
      if (!title) return sendJson(res, 400, { error: 'Titre de tâche invalide' });
      renamed = title !== access.task.title;
      data.title = title;
    }
    if (body.description !== undefined) {
      const description = optionalText(body.description, 10_000);
      if (description === undefined) return sendJson(res, 400, { error: 'Description invalide' });
      data.description = description;
    }
    for (const [field, parse] of [['priority', enums.priority], ['state', enums.state]]) {
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
    if (body.plannedHours !== undefined) {
      const plannedHours = optionalInt(body.plannedHours, { min: 0, max: 100_000 });
      if (plannedHours === undefined) return sendJson(res, 400, { error: 'Charge planifiée invalide' });
      data.plannedHours = plannedHours;
    }
    if (body.progress !== undefined) {
      const progress = optionalInt(body.progress, { min: 0, max: 100 });
      if (progress === null || progress === undefined) return sendJson(res, 400, { error: 'Avancement invalide' });
      data.progress = progress;
    }
    if (body.archived !== undefined) {
      const archived = parseBool(body.archived);
      if (archived === null) return sendJson(res, 400, { error: 'Valeur archived invalide' });
      data.archived = archived;
    }
    if (body.ownerId !== undefined) {
      const ownerId = await resolveOwner(body.ownerId, access.project.id);
      if (ownerId === undefined) return sendJson(res, 400, { error: 'Responsable hors du projet' });
      data.ownerId = ownerId;
    }
    const macros = readMacros(body);
    if (macros === undefined) return sendJson(res, 400, { error: 'Macro inconnue' });
    Object.assign(data, macros);

    let moved = false;
    if (body.parentId !== undefined) {
      if (!body.parentId) {
        data.parentId = null;
        data.path = '/';
        moved = true;
      } else {
        const parent = await prisma.task.findFirst({
          where: { id: String(body.parentId), projectId: access.project.id },
          select: { id: true, title: true, path: true },
        });
        if (!parent) return sendJson(res, 400, { error: 'Tâche parente introuvable' });
        if (parent.id === access.task.id) return sendJson(res, 400, { error: 'Une tâche ne peut pas être sa propre parente' });
        if (await isDescendant(prisma.task, parent.id, access.task.id)) {
          return sendJson(res, 400, { error: 'Déplacement impossible : la cible est une sous-tâche' });
        }
        data.parentId = parent.id;
        data.path = childPath(parent);
        moved = true;
      }
    }
    const start = data.startDate ?? access.task.startDate;
    const due = data.dueDate ?? access.task.dueDate;
    if (start && due && due < start) return sendJson(res, 400, { error: 'L’échéance précède la date de début' });

    const updated = await prisma.task.update({ where: { id: access.task.id }, data, include: taskInclude });
    if (renamed || moved) await reindexSubtree(updated.id);
    await prisma.taskEvent.create({
      data: { taskId: updated.id, actorId: access.user.id, action: 'EDIT', payload: Object.keys(data) },
    });
    const fresh = await prisma.task.findUnique({ where: { id: updated.id }, include: taskInclude });
    return sendJson(res, 200, { task: serializeTask(fresh) });
  } catch (error) {
    console.error('[emonos:tasks:patch]', error);
    return sendJson(res, 500, { error: 'Erreur serveur' });
  }
}

/** DELETE /api/emonos/tasks/:id — action DELETE (la descendance suit). */
export async function deleteTask(req, res) {
  setCors(res);
  try {
    const access = await requireTask(req, req.params?.id, { write: true });
    if (access.error) return sendJson(res, access.status, { error: access.error });
    await prisma.task.delete({ where: { id: access.task.id } });
    return sendJson(res, 200, { deleted: true });
  } catch (error) {
    console.error('[emonos:tasks:delete]', error);
    return sendJson(res, 500, { error: 'Erreur serveur' });
  }
}

/**
 * POST /api/emonos/tasks/:id/actions/:action
 * `archive` / `unarchive` (bouton ARCHIVE), `dashboard` et `configure` (macros custom).
 */
export async function runTaskAction(req, res) {
  setCors(res);
  try {
    const access = await requireTask(req, req.params?.id, { write: true });
    if (access.error) return sendJson(res, access.status, { error: access.error });
    const action = String(req.params?.action || '').toLowerCase();
    const { task, user } = access;

    if (action === 'archive' || action === 'unarchive') {
      const archived = action === 'archive';
      const updated = await prisma.task.update({
        where: { id: task.id },
        data: { archived },
        include: taskInclude,
      });
      /** Le deck archive la branche entière : la tâche disparaît avec ses filles. */
      await archiveSubtree(task.id, archived);
      await prisma.taskEvent.create({ data: { taskId: task.id, actorId: user.id, action: archived ? 'ARCHIVE' : 'UNARCHIVE' } });
      return sendJson(res, 200, { task: serializeTask(updated) });
    }

    if (action === 'dashboard') {
      if (!task.eventDashboard) return sendJson(res, 400, { error: 'Aucune macro event_dashboard sur cette tâche' });
      const result = await runDashboardMacro(task);
      await prisma.taskEvent.create({
        data: { taskId: task.id, actorId: user.id, action: 'MACRO_DASHBOARD', payload: { macro: task.eventDashboard } },
      });
      return sendJson(res, 200, { macro: task.eventDashboard, dashboard: result });
    }

    if (action === 'configure') {
      if (!task.eventConfigure) return sendJson(res, 400, { error: 'Aucune macro event_configure sur cette tâche' });
      const result = await runConfigureMacro(task, user.id);
      await prisma.taskEvent.create({
        data: { taskId: task.id, actorId: user.id, action: 'MACRO_CONFIGURE', payload: { macro: task.eventConfigure, created: result.created.length } },
      });
      return sendJson(res, 200, { macro: task.eventConfigure, ...result });
    }

    return sendJson(res, 400, { error: 'Action inconnue' });
  } catch (error) {
    console.error('[emonos:tasks:action]', error);
    return sendJson(res, 500, { error: 'Erreur serveur' });
  }
}

async function archiveSubtree(taskId, archived) {
  let frontier = [taskId];
  while (frontier.length) {
    const children = await prisma.task.findMany({ where: { parentId: { in: frontier } }, select: { id: true } });
    if (!children.length) return;
    const ids = children.map((c) => c.id);
    await prisma.task.updateMany({ where: { id: { in: ids } }, data: { archived } });
    frontier = ids;
  }
}

/** Identifiants de la tâche et de toute sa descendance. */
async function subtreeIds(taskId) {
  const ids = [taskId];
  let frontier = [taskId];
  while (frontier.length) {
    const children = await prisma.task.findMany({ where: { parentId: { in: frontier } }, select: { id: true } });
    if (!children.length) break;
    frontier = children.map((c) => c.id);
    ids.push(...frontier);
  }
  return ids;
}

/** Macro `event_dashboard` : synthèse chiffrée de la branche. */
async function runDashboardMacro(task) {
  const ids = await subtreeIds(task.id);
  const [byState, byPriority, aggregates, overdue] = await Promise.all([
    prisma.task.groupBy({ by: ['state'], where: { id: { in: ids }, archived: false }, _count: { _all: true } }),
    prisma.task.groupBy({ by: ['priority'], where: { id: { in: ids }, archived: false }, _count: { _all: true } }),
    prisma.task.aggregate({
      where: { id: { in: ids }, archived: false },
      _sum: { plannedHours: true },
      _avg: { progress: true },
      _count: { _all: true },
    }),
    prisma.task.count({
      where: { id: { in: ids }, archived: false, dueDate: { lt: new Date() }, state: { notIn: ['DONE', 'CANCELLED'] } },
    }),
  ]);
  const nextMilestone = await prisma.task.findFirst({
    where: { id: { in: ids }, archived: false, dueDate: { gte: new Date() } },
    orderBy: { dueDate: 'asc' },
    select: { id: true, title: true, dueDate: true },
  });
  return {
    taskId: task.id,
    title: task.title,
    total: aggregates._count._all,
    plannedHours: aggregates._sum.plannedHours || 0,
    averageProgress: Math.round(aggregates._avg.progress || 0),
    overdue,
    byState: Object.fromEntries(byState.map((r) => [r.state, r._count._all])),
    byPriority: Object.fromEntries(byPriority.map((r) => [r.priority, r._count._all])),
    nextMilestone,
    daysToDue: task.dueDate ? Math.ceil((task.dueDate.getTime() - Date.now()) / DAY_MS) : null,
  };
}

/** Sous-tâches déployées par chaque macro `event_configure`. */
const CONFIGURE_RECIPES = {
  configure_repository: ['Créer le dépôt Git', 'Protéger la branche principale', 'Ajouter les droits de l’équipe', 'Rédiger le README'],
  configure_ci: ['Déclarer le pipeline', 'Brancher les tests automatisés', 'Publier le rapport de couverture', 'Configurer les notifications'],
  configure_review_board: ['Nommer les relecteurs', 'Planifier le comité', 'Préparer la grille de revue'],
};

/** Macro `event_configure` : exécute le script de configuration de la tâche. */
async function runConfigureMacro(task, actorId) {
  const steps = CONFIGURE_RECIPES[task.eventConfigure] || [];
  const existing = await prisma.task.findMany({
    where: { parentId: task.id, title: { in: steps } },
    select: { title: true },
  });
  const already = new Set(existing.map((t) => t.title));
  const missing = steps.filter((title) => !already.has(title));
  const basePosition = await prisma.task.count({ where: { parentId: task.id } });
  const created = [];
  for (const [index, title] of missing.entries()) {
    const child = await prisma.task.create({
      data: {
        projectId: task.projectId,
        parentId: task.id,
        title,
        path: childPath(task),
        position: basePosition + index,
        priority: task.priority === 'CRITICAL' ? 'HIGH' : task.priority,
        startDate: task.startDate,
        dueDate: task.dueDate,
        events: { create: { action: 'MACRO_CONFIGURE', actorId } },
      },
      include: taskInclude,
    });
    created.push(serializeTask(child));
  }
  return { created, skipped: steps.length - missing.length };
}

/** GET /api/emonos/tasks/:id — détail, fil d'Ariane et journal des actions. */
export async function getTask(req, res) {
  setCors(res);
  try {
    const access = await requireTask(req, req.params?.id);
    if (access.error) return sendJson(res, access.status, { error: access.error });
    const [task, events, children] = await Promise.all([
      prisma.task.findUnique({ where: { id: access.task.id }, include: taskInclude }),
      prisma.task.findUnique({ where: { id: access.task.id } }).events({
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: { actor: { select: { id: true, displayName: true } } },
      }),
      prisma.task.findMany({
        where: { parentId: access.task.id, archived: false },
        include: taskInclude,
        orderBy: { position: 'asc' },
      }),
    ]);
    return sendJson(res, 200, {
      task: serializeTask(task),
      children: children.map(serializeTask),
      events,
      /** Macros proposées dans le formulaire d'édition. */
      availableMacros: TASK_MACROS,
    });
  } catch (error) {
    console.error('[emonos:tasks:get]', error);
    return sendJson(res, 500, { error: 'Erreur serveur' });
  }
}

/** GET /api/emonos/my-tasks — tâches assignées à l'utilisateur, tous projets confondus. */
export async function listMyTasks(req, res) {
  setCors(res);
  try {
    const auth = await requireUser(req);
    if (auth.error) return sendJson(res, auth.status, { error: auth.error });
    const tasks = await prisma.task.findMany({
      where: { ownerId: auth.user.id, archived: false, state: { notIn: ['DONE', 'CANCELLED'] } },
      include: { ...taskInclude, project: { select: { id: true, name: true } } },
      orderBy: [{ dueDate: 'asc' }, { priority: 'desc' }],
      take: 50,
    });
    return sendJson(res, 200, {
      tasks: tasks.map((t) => ({ ...serializeTask(t), project: t.project })),
    });
  } catch (error) {
    console.error('[emonos:tasks:mine]', error);
    return sendJson(res, 500, { error: 'Erreur serveur' });
  }
}
