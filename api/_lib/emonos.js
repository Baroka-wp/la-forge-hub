/**
 * EMONOS — helpers partagés : validation, droits d'accès, sérialisation.
 *
 * Règle d'accès à un projet : administrateur, propriétaire, membre du projet,
 * ou membre de l'équipe rattachée. L'écriture exige en plus un rôle
 * OWNER / MANAGER / MEMBER (VIEWER = lecture seule).
 */
import { prisma } from './prisma.js';
import { requireUser } from './auth.js';
import {
  DATE_MODES,
  MEMBER_ROLES,
  PROJECT_KINDS,
  PROJECT_STAGES,
  TASK_PRIORITIES,
  TASK_STATES,
} from './emonos-blueprints.js';

export const DAY_MS = 86_400_000;

/** @param {unknown} value */
export function text(value, maxLength) {
  if (typeof value !== 'string') return undefined;
  const cleaned = value.trim();
  if (!cleaned || cleaned.length > maxLength) return undefined;
  return cleaned;
}

/** Chaîne facultative : `null` efface la valeur, `undefined` signale une erreur. */
export function optionalText(value, maxLength) {
  if (value === null || value === undefined || value === '') return null;
  return text(value, maxLength);
}

/** @param {unknown} value */
export function optionalDate(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' && !(value instanceof Date)) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** @param {unknown} value */
export function optionalInt(value, { min = 0, max = 1_000_000 } = {}) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) return undefined;
  return n;
}

export function oneOf(value, allowed, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  return allowed.includes(value) ? value : undefined;
}

export const enums = {
  kind: (v, fallback = 'SOFTWARE_DEV') => oneOf(v, PROJECT_KINDS, fallback),
  stage: (v, fallback = 'PRESALE') => oneOf(v, PROJECT_STAGES, fallback),
  priority: (v, fallback = 'NORMAL') => oneOf(v, TASK_PRIORITIES, fallback),
  state: (v, fallback = 'TODO') => oneOf(v, TASK_STATES, fallback),
  dateMode: (v, fallback = 'NONE') => oneOf(v, DATE_MODES, fallback),
  memberRole: (v, fallback = 'MEMBER') => oneOf(v, MEMBER_ROLES, fallback),
};

export function parseBool(value) {
  if (value === true || value === 'true' || value === '1') return true;
  if (value === false || value === 'false' || value === '0') return false;
  return null;
}

/** Query string d'une requête Node/Express, indépendamment du routeur. */
export function query(req) {
  if (req.query && typeof req.query === 'object') return req.query;
  const url = new URL(req.url || '/', 'http://local');
  return Object.fromEntries(url.searchParams.entries());
}

/**
 * Rôle effectif de l'utilisateur sur un projet, ou `null` s'il n'y a pas accès.
 * @returns {Promise<'OWNER'|'MANAGER'|'MEMBER'|'VIEWER'|null>}
 */
export async function projectRole(project, user) {
  if (!project || !user) return null;
  if (user.role === 'admin') return 'OWNER';
  if (project.ownerId === user.id) return 'OWNER';
  const membership = await prisma.taskProjectMember.findUnique({
    where: { projectId_userId: { projectId: project.id, userId: user.id } },
    select: { role: true },
  });
  if (membership) return membership.role;
  if (project.teamId) {
    const teamMembership = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId: project.teamId, userId: user.id } },
      select: { role: true },
    });
    if (teamMembership) return teamMembership.role;
  }
  return null;
}

export function canWrite(role) {
  return role === 'OWNER' || role === 'MANAGER' || role === 'MEMBER';
}

export function canAdminister(role) {
  return role === 'OWNER' || role === 'MANAGER';
}

/**
 * Authentifie puis charge le projet en vérifiant les droits.
 * @returns {Promise<{ error?: string, status?: number, user?: object, project?: object, role?: string }>}
 */
export async function requireProject(req, projectId, { write = false, administer = false } = {}) {
  const auth = await requireUser(req);
  if (auth.error) return auth;
  const id = String(projectId || '').trim();
  if (!id) return { error: 'Projet introuvable', status: 404 };
  const project = await prisma.taskProject.findUnique({ where: { id } });
  if (!project) return { error: 'Projet introuvable', status: 404 };
  const role = await projectRole(project, auth.user);
  if (!role) return { error: 'Projet introuvable', status: 404 };
  if (administer && !canAdminister(role)) return { error: 'Droits insuffisants sur ce projet', status: 403 };
  if (write && !canWrite(role)) return { error: 'Droits insuffisants sur ce projet', status: 403 };
  return { user: auth.user, project, role };
}

/** Identifiants des projets visibles par l'utilisateur (admin : tous). */
export async function visibleProjectIds(user) {
  if (user.role === 'admin') return null;
  const [owned, memberships, teamIds] = await Promise.all([
    prisma.taskProject.findMany({ where: { ownerId: user.id }, select: { id: true } }),
    prisma.taskProjectMember.findMany({ where: { userId: user.id }, select: { projectId: true } }),
    prisma.teamMember.findMany({ where: { userId: user.id }, select: { teamId: true } }),
  ]);
  const ids = new Set([...owned.map((p) => p.id), ...memberships.map((m) => m.projectId)]);
  if (teamIds.length) {
    const teamProjects = await prisma.taskProject.findMany({
      where: { teamId: { in: teamIds.map((t) => t.teamId) } },
      select: { id: true },
    });
    teamProjects.forEach((p) => ids.add(p.id));
  }
  return [...ids];
}

const userSelect = { id: true, displayName: true, email: true };

export const projectInclude = {
  owner: { select: userSelect },
  team: { select: { id: true, name: true } },
  _count: { select: { tasks: true, children: true, documents: true } },
};

export function serializeProject(project) {
  return {
    id: project.id,
    name: project.name,
    notes: project.notes,
    kind: project.kind,
    stage: project.stage,
    priority: project.priority,
    parentId: project.parentId,
    dateMode: project.dateMode,
    startDate: project.startDate,
    dueDate: project.dueDate,
    timezone: project.timezone,
    archived: project.archived,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    owner: project.owner ? { id: project.owner.id, displayName: project.owner.displayName } : null,
    team: project.team || null,
    taskCount: project._count?.tasks ?? undefined,
    childCount: project._count?.children ?? undefined,
    documentCount: project._count?.documents ?? undefined,
  };
}

export const taskInclude = {
  owner: { select: userSelect },
  _count: { select: { children: true } },
};

export function serializeTask(task) {
  return {
    id: task.id,
    projectId: task.projectId,
    parentId: task.parentId,
    title: task.title,
    description: task.description,
    path: task.path,
    position: task.position,
    priority: task.priority,
    state: task.state,
    startDate: task.startDate,
    dueDate: task.dueDate,
    plannedHours: task.plannedHours,
    progress: task.progress,
    archived: task.archived,
    /** Le deck n'affiche DASHBOARD / CONFIGURE que si la macro est présente. */
    eventDashboard: task.eventDashboard,
    eventConfigure: task.eventConfigure,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    owner: task.owner ? { id: task.owner.id, displayName: task.owner.displayName } : null,
    childCount: task._count?.children ?? 0,
  };
}

/** Chemin matérialisé d'une sous-tâche : « /Développement/Design ». */
export function childPath(parent) {
  if (!parent) return '/';
  const base = parent.path === '/' ? '' : parent.path;
  return `${base}/${parent.title}`;
}

/**
 * Recalcule `path` pour toute la descendance d'une tâche renommée ou déplacée.
 * @param {string} taskId
 */
export async function reindexSubtree(taskId) {
  const root = await prisma.task.findUnique({ where: { id: taskId }, select: { id: true, path: true, title: true } });
  if (!root) return;
  const queue = [root];
  while (queue.length) {
    const current = queue.shift();
    const path = childPath(current);
    const children = await prisma.task.findMany({
      where: { parentId: current.id },
      select: { id: true, title: true },
    });
    if (!children.length) continue;
    await prisma.task.updateMany({ where: { parentId: current.id }, data: { path } });
    children.forEach((child) => queue.push({ ...child, path }));
  }
}

/** Empêche de rattacher une tâche (ou un projet) à sa propre descendance. */
export async function isDescendant(model, candidateParentId, nodeId) {
  let cursor = candidateParentId;
  const seen = new Set();
  while (cursor) {
    if (cursor === nodeId) return true;
    if (seen.has(cursor)) return false;
    seen.add(cursor);
    const row = await model.findUnique({ where: { id: cursor }, select: { parentId: true } });
    cursor = row?.parentId || null;
  }
  return false;
}
