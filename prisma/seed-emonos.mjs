/**
 * Jeu de démonstration EMONOS : deux équipes et le projet « LOGOS » du deck,
 * déployé depuis le modèle « développement logiciel ».
 *
 * Usage : npm run db:seed:emonos [-- --owner email@exemple.com]
 * Idempotent : relancer le script ne duplique ni les équipes ni le projet.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { blueprintFor } from '../api/_lib/emonos-blueprints.js';
import { applyBlueprintToProject, startBlueprintWorkflow } from '../api/emonos-projects.js';

const prisma = new PrismaClient();

const DEMO_USERS = [
  { email: 'awa@emonos.local', displayName: 'Awa Diallo', role: 'OWNER' },
  { email: 'koffi@emonos.local', displayName: 'Koffi Mensah', role: 'MEMBER' },
  { email: 'ines@emonos.local', displayName: 'Inès Roux', role: 'MEMBER' },
];

const TEAMS = [
  { name: 'Team of super dev', description: 'Équipe produit et développement', members: ['awa@emonos.local', 'koffi@emonos.local'] },
  { name: 'Administrative staff', description: 'Back-office, contrats et facturation', members: ['ines@emonos.local'] },
];

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index > -1 ? process.argv[index + 1] : null;
}

async function ensureUser({ email, displayName }) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return existing;
  /** Comptes de démonstration : mot de passe aléatoire, connexion par réinitialisation. */
  const passwordHash = await bcrypt.hash(`${email}-${Date.now()}-${Math.random()}`, 10);
  return prisma.user.create({ data: { email, displayName, passwordHash } });
}

async function main() {
  const ownerEmail = argValue('--owner');
  const users = new Map();
  for (const demo of DEMO_USERS) {
    users.set(demo.email, await ensureUser(demo));
  }

  let owner = users.get('awa@emonos.local');
  if (ownerEmail) {
    const requested = await prisma.user.findUnique({ where: { email: ownerEmail.toLowerCase() } });
    if (!requested) {
      console.error(`Compte introuvable : ${ownerEmail}`);
      process.exitCode = 1;
      return;
    }
    owner = requested;
  }

  for (const team of TEAMS) {
    const row = await prisma.team.upsert({
      where: { name: team.name },
      update: { description: team.description },
      create: { name: team.name, description: team.description },
    });
    const memberIds = team.members.map((email) => users.get(email).id);
    if (!memberIds.includes(owner.id)) memberIds.push(owner.id);
    await prisma.teamMember.createMany({
      data: memberIds.map((userId, index) => ({
        teamId: row.id,
        userId,
        role: index === 0 ? 'OWNER' : 'MEMBER',
      })),
      skipDuplicates: true,
    });
  }

  const existing = await prisma.taskProject.findFirst({ where: { name: 'LOGOS' } });
  if (existing) {
    console.log('Projet « LOGOS » déjà présent — rien à faire.');
    return;
  }

  const team = await prisma.team.findUnique({ where: { name: 'Team of super dev' } });
  const blueprint = blueprintFor('SOFTWARE_DEV');
  const startDate = new Date();
  startDate.setUTCHours(0, 0, 0, 0);

  const project = await prisma.taskProject.create({
    data: {
      name: 'LOGOS',
      notes: 'Projet de démonstration issu de la présentation EMONOS.',
      kind: 'SOFTWARE_DEV',
      priority: 'HIGH',
      ownerId: owner.id,
      teamId: team?.id ?? null,
      dateMode: 'AUTOMATIC',
      startDate,
      dueDate: new Date(startDate.getTime() + blueprint.durationDays * 86_400_000),
      stage: blueprint.defaultStage,
      members: { create: { userId: owner.id, role: 'OWNER' } },
    },
  });

  if (team) {
    const teamMembers = await prisma.teamMember.findMany({ where: { teamId: team.id } });
    await prisma.taskProjectMember.createMany({
      data: teamMembers.map((m) => ({ projectId: project.id, userId: m.userId, role: m.role })),
      skipDuplicates: true,
    });
  }

  const created = await applyBlueprintToProject(project, blueprint);
  await startBlueprintWorkflow(project, blueprint, owner.id);
  console.log(`Projet « LOGOS » créé : ${created.tasks} tâches, ${created.documents} documents.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
