/**
 * EMONOS — équipes et membres de projet (« Team management » du deck).
 * Les équipes sont réutilisables : l'assistant de création les importe sur un projet.
 */
import { prisma } from './_lib/prisma.js';
import { requireUser } from './_lib/auth.js';
import { readJsonBody, sendJson, setCors } from './_lib/http.js';
import { canAdminister, enums, optionalText, query, requireProject, text } from './_lib/emonos.js';

const memberInclude = { user: { select: { id: true, displayName: true, email: true } } };

/** Rôle de l'utilisateur dans l'équipe (admin plateforme : OWNER). */
async function teamRole(teamId, user) {
  if (user.role === 'admin') return 'OWNER';
  const membership = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId: user.id } },
    select: { role: true },
  });
  return membership?.role || null;
}

/** GET /api/emonos/teams */
export async function listTeams(req, res) {
  setCors(res);
  try {
    const auth = await requireUser(req);
    if (auth.error) return sendJson(res, auth.status, { error: auth.error });
    const teams = await prisma.team.findMany({
      orderBy: { name: 'asc' },
      include: { members: { include: memberInclude }, _count: { select: { projects: true } } },
    });
    return sendJson(res, 200, {
      teams: teams.map((team) => ({
        id: team.id,
        name: team.name,
        description: team.description,
        projectCount: team._count.projects,
        members: team.members.map((m) => ({ role: m.role, user: m.user })),
      })),
    });
  } catch (error) {
    console.error('[emonos:teams:list]', error);
    return sendJson(res, 500, { error: 'Erreur serveur' });
  }
}

/** POST /api/emonos/teams — le créateur en devient responsable. */
export async function createTeam(req, res) {
  setCors(res);
  try {
    const auth = await requireUser(req);
    if (auth.error) return sendJson(res, auth.status, { error: auth.error });
    const body = await readJsonBody(req);
    const name = text(body.name, 120);
    if (!name) return sendJson(res, 400, { error: 'Nom d’équipe requis' });
    const description = optionalText(body.description, 2_000);
    if (description === undefined) return sendJson(res, 400, { error: 'Description invalide' });
    const existing = await prisma.team.findUnique({ where: { name }, select: { id: true } });
    if (existing) return sendJson(res, 409, { error: 'Une équipe porte déjà ce nom' });
    const team = await prisma.team.create({
      data: { name, description, members: { create: { userId: auth.user.id, role: 'OWNER' } } },
      include: { members: { include: memberInclude } },
    });
    return sendJson(res, 201, {
      team: { id: team.id, name: team.name, description: team.description, members: team.members.map((m) => ({ role: m.role, user: m.user })) },
    });
  } catch (error) {
    console.error('[emonos:teams:create]', error);
    return sendJson(res, 500, { error: 'Erreur serveur' });
  }
}

/** PATCH /api/emonos/teams/:id */
export async function patchTeam(req, res) {
  setCors(res);
  try {
    const auth = await requireUser(req);
    if (auth.error) return sendJson(res, auth.status, { error: auth.error });
    const team = await prisma.team.findUnique({ where: { id: String(req.params?.id || '') } });
    if (!team) return sendJson(res, 404, { error: 'Équipe introuvable' });
    const role = await teamRole(team.id, auth.user);
    if (!canAdminister(role)) return sendJson(res, 403, { error: 'Droits insuffisants sur cette équipe' });

    const body = await readJsonBody(req);
    const data = {};
    if (body.name !== undefined) {
      const name = text(body.name, 120);
      if (!name) return sendJson(res, 400, { error: 'Nom d’équipe invalide' });
      const clash = await prisma.team.findFirst({ where: { name, NOT: { id: team.id } }, select: { id: true } });
      if (clash) return sendJson(res, 409, { error: 'Une équipe porte déjà ce nom' });
      data.name = name;
    }
    if (body.description !== undefined) {
      const description = optionalText(body.description, 2_000);
      if (description === undefined) return sendJson(res, 400, { error: 'Description invalide' });
      data.description = description;
    }
    const updated = await prisma.team.update({ where: { id: team.id }, data });
    return sendJson(res, 200, { team: { id: updated.id, name: updated.name, description: updated.description } });
  } catch (error) {
    console.error('[emonos:teams:patch]', error);
    return sendJson(res, 500, { error: 'Erreur serveur' });
  }
}

/** DELETE /api/emonos/teams/:id — les projets rattachés perdent leur équipe. */
export async function deleteTeam(req, res) {
  setCors(res);
  try {
    const auth = await requireUser(req);
    if (auth.error) return sendJson(res, auth.status, { error: auth.error });
    const team = await prisma.team.findUnique({ where: { id: String(req.params?.id || '') } });
    if (!team) return sendJson(res, 404, { error: 'Équipe introuvable' });
    const role = await teamRole(team.id, auth.user);
    if (role !== 'OWNER') return sendJson(res, 403, { error: 'Seul un responsable peut supprimer l’équipe' });
    await prisma.team.delete({ where: { id: team.id } });
    return sendJson(res, 200, { deleted: true });
  } catch (error) {
    console.error('[emonos:teams:delete]', error);
    return sendJson(res, 500, { error: 'Erreur serveur' });
  }
}

/** POST /api/emonos/teams/:id/members — { email | userId, role } */
export async function addTeamMember(req, res) {
  setCors(res);
  try {
    const auth = await requireUser(req);
    if (auth.error) return sendJson(res, auth.status, { error: auth.error });
    const team = await prisma.team.findUnique({ where: { id: String(req.params?.id || '') } });
    if (!team) return sendJson(res, 404, { error: 'Équipe introuvable' });
    const role = await teamRole(team.id, auth.user);
    if (!canAdminister(role)) return sendJson(res, 403, { error: 'Droits insuffisants sur cette équipe' });

    const body = await readJsonBody(req);
    const memberRole = enums.memberRole(body.role);
    if (!memberRole) return sendJson(res, 400, { error: 'Rôle inconnu' });
    const user = await findUser(body);
    if (!user) return sendJson(res, 404, { error: 'Utilisateur introuvable' });

    const member = await prisma.teamMember.upsert({
      where: { teamId_userId: { teamId: team.id, userId: user.id } },
      update: { role: memberRole },
      create: { teamId: team.id, userId: user.id, role: memberRole },
      include: memberInclude,
    });
    return sendJson(res, 200, { member: { role: member.role, user: member.user } });
  } catch (error) {
    console.error('[emonos:teams:add-member]', error);
    return sendJson(res, 500, { error: 'Erreur serveur' });
  }
}

/** DELETE /api/emonos/teams/:id/members/:userId */
export async function removeTeamMember(req, res) {
  setCors(res);
  try {
    const auth = await requireUser(req);
    if (auth.error) return sendJson(res, auth.status, { error: auth.error });
    const teamId = String(req.params?.id || '');
    const team = await prisma.team.findUnique({ where: { id: teamId } });
    if (!team) return sendJson(res, 404, { error: 'Équipe introuvable' });
    const role = await teamRole(team.id, auth.user);
    if (!canAdminister(role)) return sendJson(res, 403, { error: 'Droits insuffisants sur cette équipe' });
    const userId = String(req.params?.userId || '');
    const owners = await prisma.teamMember.count({ where: { teamId, role: 'OWNER' } });
    const target = await prisma.teamMember.findUnique({ where: { teamId_userId: { teamId, userId } } });
    if (!target) return sendJson(res, 404, { error: 'Membre introuvable' });
    if (target.role === 'OWNER' && owners <= 1) {
      return sendJson(res, 409, { error: 'L’équipe doit garder au moins un responsable' });
    }
    await prisma.teamMember.delete({ where: { teamId_userId: { teamId, userId } } });
    return sendJson(res, 200, { removed: true });
  } catch (error) {
    console.error('[emonos:teams:remove-member]', error);
    return sendJson(res, 500, { error: 'Erreur serveur' });
  }
}

/** POST /api/emonos/projects/:id/members */
export async function addProjectMember(req, res) {
  setCors(res);
  try {
    const access = await requireProject(req, req.params?.id, { administer: true });
    if (access.error) return sendJson(res, access.status, { error: access.error });
    const body = await readJsonBody(req);
    const role = enums.memberRole(body.role);
    if (!role) return sendJson(res, 400, { error: 'Rôle inconnu' });
    const user = await findUser(body);
    if (!user) return sendJson(res, 404, { error: 'Utilisateur introuvable' });
    const member = await prisma.taskProjectMember.upsert({
      where: { projectId_userId: { projectId: access.project.id, userId: user.id } },
      update: { role },
      create: { projectId: access.project.id, userId: user.id, role },
      include: memberInclude,
    });
    return sendJson(res, 200, { member: { role: member.role, user: member.user } });
  } catch (error) {
    console.error('[emonos:projects:add-member]', error);
    return sendJson(res, 500, { error: 'Erreur serveur' });
  }
}

/** DELETE /api/emonos/projects/:id/members/:userId */
export async function removeProjectMember(req, res) {
  setCors(res);
  try {
    const access = await requireProject(req, req.params?.id, { administer: true });
    if (access.error) return sendJson(res, access.status, { error: access.error });
    const userId = String(req.params?.userId || '');
    if (userId === access.project.ownerId) {
      return sendJson(res, 409, { error: 'Le propriétaire du projet ne peut pas être retiré' });
    }
    const target = await prisma.taskProjectMember.findUnique({
      where: { projectId_userId: { projectId: access.project.id, userId } },
    });
    if (!target) return sendJson(res, 404, { error: 'Membre introuvable' });
    await prisma.taskProjectMember.delete({
      where: { projectId_userId: { projectId: access.project.id, userId } },
    });
    await prisma.task.updateMany({
      where: { projectId: access.project.id, ownerId: userId },
      data: { ownerId: null },
    });
    return sendJson(res, 200, { removed: true });
  } catch (error) {
    console.error('[emonos:projects:remove-member]', error);
    return sendJson(res, 500, { error: 'Erreur serveur' });
  }
}

async function findUser(body) {
  if (body.userId) return prisma.user.findUnique({ where: { id: String(body.userId) }, select: { id: true } });
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!email) return null;
  return prisma.user.findUnique({ where: { email }, select: { id: true } });
}

/** GET /api/emonos/directory?q= — annuaire pour choisir un membre. */
export async function searchDirectory(req, res) {
  setCors(res);
  try {
    const auth = await requireUser(req);
    if (auth.error) return sendJson(res, auth.status, { error: auth.error });
    const q = query(req);
    const term = optionalText(q.q, 120);
    const users = await prisma.user.findMany({
      where: term
        ? {
            OR: [
              { displayName: { contains: term, mode: 'insensitive' } },
              { email: { contains: term, mode: 'insensitive' } },
            ],
          }
        : {},
      select: { id: true, displayName: true, email: true },
      orderBy: { displayName: 'asc' },
      take: 20,
    });
    return sendJson(res, 200, { users });
  } catch (error) {
    console.error('[emonos:directory]', error);
    return sendJson(res, 500, { error: 'Erreur serveur' });
  }
}
