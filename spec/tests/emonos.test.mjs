import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

const DB_NAME = 'laforge_emonos_spec';
/**
 * Surchargeable pour les environnements où le rôle `baroka` n'existe pas (CI, conteneur) :
 * `SPEC_DATABASE_URL` accepte un gabarit contenant `{db}`.
 */
const DATABASE_URL = (process.env.SPEC_DATABASE_URL || 'postgresql://baroka@127.0.0.1:5432/{db}')
  .replace('{db}', DB_NAME);
process.env.DATABASE_URL = DATABASE_URL;
process.env.JWT_SECRET = 'emonos-spec-secret-that-is-long-enough';

function psql(database, sql) {
  return execFileSync('psql', ['-v', 'ON_ERROR_STOP=1', '-d', database, '-Atqc', sql], { encoding: 'utf8' }).trim();
}

let server;
let baseUrl;
let ownerToken;
let memberToken;
let outsiderToken;
let viewerToken;

test.before(async () => {
  psql('postgres', `DROP DATABASE IF EXISTS ${DB_NAME}`);
  psql('postgres', `CREATE DATABASE ${DB_NAME}`);
  execFileSync('node', ['node_modules/prisma/build/index.js', 'db', 'push', '--skip-generate'], {
    env: { ...process.env, DATABASE_URL }, stdio: 'pipe',
  });
  psql(DB_NAME, `
    ALTER TABLE users ALTER COLUMN updated_at SET DEFAULT now();
    ALTER TABLE teams ALTER COLUMN updated_at SET DEFAULT now();
    ALTER TABLE task_projects ALTER COLUMN updated_at SET DEFAULT now();
    ALTER TABLE tasks ALTER COLUMN updated_at SET DEFAULT now();
    INSERT INTO users(id,email,password_hash,display_name,role,auth_version)
      VALUES ('u-owner','owner@example.com','hash','Awa','learner',0),
             ('u-member','member@example.com','hash','Koffi','learner',0),
             ('u-viewer','viewer@example.com','hash','Ines','learner',0),
             ('u-outsider','outsider@example.com','hash','Rex','learner',0);
    INSERT INTO teams(id,name,description) VALUES ('team-dev','Team of super dev','Équipe produit');
    INSERT INTO team_members(team_id,user_id,role)
      VALUES ('team-dev','u-owner','OWNER'), ('team-dev','u-member','MEMBER');
  `);

  const express = (await import('express')).default;
  const { registerApiRoutes } = await import('../../server/api-routes.mjs');
  const { signToken } = await import('../../api/_lib/jwt.js');
  ownerToken = signToken({ sub: 'u-owner', av: 0 });
  memberToken = signToken({ sub: 'u-member', av: 0 });
  viewerToken = signToken({ sub: 'u-viewer', av: 0 });
  outsiderToken = signToken({ sub: 'u-outsider', av: 0 });
  const app = express();
  app.use(express.json());
  registerApiRoutes(app);
  server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  const { prisma } = await import('../../api/_lib/prisma.js');
  await prisma.$disconnect();
  psql('postgres', `DROP DATABASE IF EXISTS ${DB_NAME}`);
});

async function request(method, path, payload, authToken = ownerToken) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

const get = (path, authToken = ownerToken) => request('GET', path, undefined, authToken);
const post = (path, payload, authToken = ownerToken) => request('POST', path, payload, authToken);
const patch = (path, payload, authToken = ownerToken) => request('PATCH', path, payload, authToken);
const put = (path, payload, authToken = ownerToken) => request('PUT', path, payload, authToken);
const del = (path, authToken = ownerToken) => request('DELETE', path, undefined, authToken);

/** Projet logiciel créé une fois, réutilisé par les tests suivants. */
let projectId;

test('POST /api/emonos/projects exige une session', async () => {
  const anonymous = await post('/api/emonos/projects', { name: 'X', kind: 'SOFTWARE_DEV', dateMode: 'NONE' }, null);
  assert.equal(anonymous.status, 401);
});

test('l’assistant déploie le modèle « développement logiciel » sur un projet daté', async () => {
  const created = await post('/api/emonos/projects', {
    name: 'LOGOS',
    notes: 'Projet du deck EMONOS',
    kind: 'SOFTWARE_DEV',
    dateMode: 'FIXED',
    startDate: '2026-01-05T00:00:00.000Z',
    dueDate: '2026-06-30T00:00:00.000Z',
    teamId: 'team-dev',
  });
  assert.equal(created.status, 201);
  projectId = created.body.project.id;
  assert.equal(created.body.project.name, 'LOGOS');
  assert.equal(created.body.project.stage, 'PRESALE');
  assert.equal(created.body.project.team.name, 'Team of super dev');
  assert.equal(created.body.created.tasks > 10, true);
  assert.equal(created.body.created.documents, 3);
  assert.equal(typeof created.body.created.workflowRunId, 'string');

  const detail = await get(`/api/emonos/projects/${projectId}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.role, 'OWNER');
  /** Les membres de l'équipe importée deviennent membres du projet. */
  assert.deepEqual(
    detail.body.members.map((m) => m.user.id).sort(),
    ['u-member', 'u-owner'],
  );
  assert.equal(detail.body.documents.length, 3);
  assert.equal(detail.body.run.currentNode.kind, 'START');
});

test('les tâches du modèle sont datées depuis la date de début et portent leur chemin', async () => {
  const roots = await get(`/api/emonos/tasks?projectId=${projectId}&parentId=root`);
  assert.equal(roots.status, 200);
  assert.deepEqual(
    roots.body.tasks.map((t) => t.title).sort(),
    ['Administratif', 'Avant-vente', 'Développement', 'Livraison'],
  );
  const dev = roots.body.tasks.find((t) => t.title === 'Développement');
  /** Le nœud « Développement » du modèle porte la macro `event_dashboard`. */
  assert.equal(dev.eventDashboard, 'sprint_dashboard');
  assert.equal(dev.eventConfigure, null);
  assert.equal(dev.startDate.slice(0, 10), '2026-01-20');
  assert.equal(dev.childCount, 3);

  const children = await get(`/api/emonos/tasks?projectId=${projectId}&parentId=${dev.id}`);
  const design = children.body.tasks.find((t) => t.title === 'Design');
  assert.equal(design.path, '/Développement');
  assert.equal(children.body.breadcrumb.path, '/Développement');

  const grandChildren = await get(`/api/emonos/tasks?projectId=${projectId}&parentId=${design.id}`);
  assert.equal(grandChildren.body.breadcrumb.path, '/Développement/Design');
  assert.deepEqual(grandChildren.body.tasks.map((t) => t.path), ['/Développement/Design', '/Développement/Design']);
});

test('les filtres latéraux du deck : critiques, arrêtées, archivées, date butoir', async () => {
  const critical = await get(`/api/emonos/tasks?projectId=${projectId}&critical=1&pageSize=100`);
  assert.equal(critical.status, 200);
  assert.equal(critical.body.tasks.length > 0, true);
  assert.equal(critical.body.tasks.every((t) => t.priority === 'CRITICAL'), true);

  const before = await get(`/api/emonos/tasks?projectId=${projectId}&before=2026-01-20T00:00:00.000Z&pageSize=100`);
  assert.equal(before.body.tasks.every((t) => new Date(t.dueDate) < new Date('2026-01-20T00:00:00.000Z')), true);
  assert.equal(before.body.tasks.length < critical.body.total + 100, true);

  const target = critical.body.tasks[0];
  assert.equal((await patch(`/api/emonos/tasks/${target.id}`, { state: 'STOPPED' })).status, 200);
  const stopped = await get(`/api/emonos/tasks?projectId=${projectId}&stopped=1&pageSize=100`);
  assert.deepEqual(stopped.body.tasks.map((t) => t.id), [target.id]);
  assert.equal((await patch(`/api/emonos/tasks/${target.id}`, { state: 'TODO' })).status, 200);
});

test('la pagination et le regroupement par jour suivent l’écran « Tasks management »', async () => {
  const firstPage = await get(`/api/emonos/tasks?projectId=${projectId}&pageSize=5&page=1`);
  assert.equal(firstPage.body.tasks.length, 5);
  assert.equal(firstPage.body.pageCount > 1, true);
  assert.equal(firstPage.body.days.length > 0, true);
  const secondPage = await get(`/api/emonos/tasks?projectId=${projectId}&pageSize=5&page=2`);
  assert.equal(
    firstPage.body.tasks.some((t) => secondPage.body.tasks.some((o) => o.id === t.id)),
    false,
  );
});

test('ARCHIVE emporte la descendance et la sort de la vue par défaut', async () => {
  const roots = await get(`/api/emonos/tasks?projectId=${projectId}&parentId=root`);
  const delivery = roots.body.tasks.find((t) => t.title === 'Livraison');
  const archived = await post(`/api/emonos/tasks/${delivery.id}/actions/archive`, {});
  assert.equal(archived.status, 200);
  assert.equal(archived.body.task.archived, true);

  const visible = await get(`/api/emonos/tasks?projectId=${projectId}&parentId=${delivery.id}`);
  assert.equal(visible.body.tasks.length, 0);
  const archivedView = await get(`/api/emonos/tasks?projectId=${projectId}&parentId=${delivery.id}&archived=1`);
  assert.equal(archivedView.body.tasks.length, 3);

  assert.equal((await post(`/api/emonos/tasks/${delivery.id}/actions/unarchive`, {})).status, 200);
  assert.equal((await get(`/api/emonos/tasks?projectId=${projectId}&parentId=${delivery.id}`)).body.tasks.length, 3);
});

test('la macro event_dashboard renvoie la synthèse de la branche, et refuse les tâches sans macro', async () => {
  const roots = await get(`/api/emonos/tasks?projectId=${projectId}&parentId=root`);
  const dev = roots.body.tasks.find((t) => t.title === 'Développement');
  const presale = roots.body.tasks.find((t) => t.title === 'Avant-vente');

  const dashboard = await post(`/api/emonos/tasks/${dev.id}/actions/dashboard`, {});
  assert.equal(dashboard.status, 200);
  assert.equal(dashboard.body.macro, 'sprint_dashboard');
  assert.equal(dashboard.body.dashboard.total, 8);
  assert.equal(typeof dashboard.body.dashboard.byState.TODO, 'number');

  const refused = await post(`/api/emonos/tasks/${presale.id}/actions/dashboard`, {});
  assert.equal(refused.status, 400);
});

test('la macro event_configure déploie sa liste de sous-tâches et reste idempotente', async () => {
  const roots = await get(`/api/emonos/tasks?projectId=${projectId}&parentId=root`);
  const dev = roots.body.tasks.find((t) => t.title === 'Développement');
  const devChildren = await get(`/api/emonos/tasks?projectId=${projectId}&parentId=${dev.id}`);
  const build = devChildren.body.tasks.find((t) => t.title === 'Réalisation');
  assert.equal(build.eventConfigure, 'configure_repository');

  const first = await post(`/api/emonos/tasks/${build.id}/actions/configure`, {});
  assert.equal(first.status, 200);
  assert.equal(first.body.created.length, 4);
  assert.equal(first.body.created[0].path, '/Développement/Réalisation');

  const second = await post(`/api/emonos/tasks/${build.id}/actions/configure`, {});
  assert.equal(second.body.created.length, 0);
  assert.equal(second.body.skipped, 4);
});

test('renommer une tâche réindexe le chemin de toute sa descendance', async () => {
  const roots = await get(`/api/emonos/tasks?projectId=${projectId}&parentId=root`);
  const dev = roots.body.tasks.find((t) => t.title === 'Développement');
  assert.equal((await patch(`/api/emonos/tasks/${dev.id}`, { title: 'Dev' })).status, 200);

  const children = await get(`/api/emonos/tasks?projectId=${projectId}&parentId=${dev.id}`);
  assert.equal(children.body.tasks.every((t) => t.path === '/Dev'), true);
  const design = children.body.tasks.find((t) => t.title === 'Design');
  const grandChildren = await get(`/api/emonos/tasks?projectId=${projectId}&parentId=${design.id}`);
  assert.equal(grandChildren.body.tasks.every((t) => t.path === '/Dev/Design'), true);

  assert.equal((await patch(`/api/emonos/tasks/${dev.id}`, { title: 'Développement' })).status, 200);
});

test('une tâche ne peut pas être rattachée à sa propre descendance', async () => {
  const roots = await get(`/api/emonos/tasks?projectId=${projectId}&parentId=root`);
  const dev = roots.body.tasks.find((t) => t.title === 'Développement');
  const children = await get(`/api/emonos/tasks?projectId=${projectId}&parentId=${dev.id}`);
  const design = children.body.tasks.find((t) => t.title === 'Design');
  const cycle = await patch(`/api/emonos/tasks/${dev.id}`, { parentId: design.id });
  assert.equal(cycle.status, 400);
  assert.equal((await patch(`/api/emonos/tasks/${dev.id}`, { parentId: dev.id })).status, 400);
});

test('les macros et les dates invalides sont rejetées', async () => {
  const badMacro = await post('/api/emonos/tasks', {
    projectId, title: 'Bidon', eventConfigure: 'rm -rf /',
  });
  assert.equal(badMacro.status, 400);
  const badDates = await post('/api/emonos/tasks', {
    projectId, title: 'Bidon', startDate: '2026-03-01', dueDate: '2026-02-01',
  });
  assert.equal(badDates.status, 400);
  const badOwner = await post('/api/emonos/tasks', { projectId, title: 'Bidon', ownerId: 'u-outsider' });
  assert.equal(badOwner.status, 400);
});

test('le moteur de workflow franchit la décision GO et instancie la sous-tâche du nœud', async () => {
  const runs = await get(`/api/emonos/runs?projectId=${projectId}`);
  assert.equal(runs.status, 200);
  const run = runs.body.runs[0];
  assert.equal(run.currentNode.kind, 'START');

  const toPresale = await post(`/api/emonos/runs/${run.id}/advance`, {});
  assert.equal(toPresale.status, 200);
  assert.equal(toPresale.body.run.currentNode.key, 'presale');
  assert.equal(toPresale.body.stage, 'PRESALE');
  /** Nœud SUBTASK : le moteur réutilise la tâche « Avant-vente » déjà créée par le modèle. */
  assert.equal(toPresale.body.createdTask.title, 'Avant-vente');

  await post(`/api/emonos/runs/${run.id}/advance`, {});
  const atDecision = await post(`/api/emonos/runs/${run.id}/advance`, {});
  assert.equal(atDecision.body.run.currentNode.kind, 'DECISION');

  const missing = await post(`/api/emonos/runs/${run.id}/advance`, {});
  assert.equal(missing.status, 400);
  assert.deepEqual(missing.body.options.sort(), ['GO', 'NO GO']);
  const unknown = await post(`/api/emonos/runs/${run.id}/advance`, { decision: 'PEUT-ÊTRE' });
  assert.equal(unknown.status, 400);

  const go = await post(`/api/emonos/runs/${run.id}/advance`, { decision: 'GO', note: 'Devis signé' });
  assert.equal(go.status, 200);
  assert.equal(go.body.run.currentNode.key, 'development');
  assert.equal(go.body.stage, 'DEVELOPMENT');
  assert.equal((await get(`/api/emonos/projects/${projectId}`)).body.project.stage, 'DEVELOPMENT');

  await post(`/api/emonos/runs/${run.id}/advance`, {});
  const end = await post(`/api/emonos/runs/${run.id}/advance`, {});
  assert.equal(end.body.run.status, 'DONE');
  assert.equal(end.body.run.currentNode.key, 'closed');
  assert.equal((await post(`/api/emonos/runs/${run.id}/advance`, {})).status, 409);
});

test('le concepteur refuse un graphe incohérent et conserve les nœuds gardés', async () => {
  const workflows = await get('/api/emonos/workflows');
  const target = workflows.body.workflows.find((w) => w.name === 'Projet logiciel');
  const before = await get(`/api/emonos/workflows/${target.id}`);
  const startId = before.body.workflow.nodes.find((n) => n.key === 'start').id;

  const noStart = await put(`/api/emonos/workflows/${target.id}`, {
    nodes: [{ key: 'a', kind: 'STEP', label: 'A', x: 0, y: 0 }],
    transitions: [],
  });
  assert.equal(noStart.status, 400);

  const unlabelledDecision = await put(`/api/emonos/workflows/${target.id}`, {
    nodes: [
      { key: 'start', kind: 'START', label: 'Début', x: 0, y: 0 },
      { key: 'd', kind: 'DECISION', label: 'Choix', x: 100, y: 0 },
      { key: 'a', kind: 'END', label: 'A', x: 200, y: 0 },
      { key: 'b', kind: 'END', label: 'B', x: 200, y: 100 },
    ],
    transitions: [
      { from: 'start', to: 'd', label: '' },
      { from: 'd', to: 'a', label: '' },
      { from: 'd', to: 'b', label: '' },
    ],
  });
  assert.equal(unlabelledDecision.status, 400);

  const saved = await put(`/api/emonos/workflows/${target.id}`, {
    description: 'Édité depuis le concepteur',
    nodes: [
      ...before.body.workflow.nodes.map(({ id, ...node }) => node),
      { key: 'audit', kind: 'STEP', label: 'Audit qualité', x: 1120, y: 260 },
    ],
    transitions: [
      ...before.body.workflow.transitions.map(({ id, ...t }) => t),
      { from: 'delivery', to: 'audit', label: 'Audit' },
    ],
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.workflow.nodes.length, before.body.workflow.nodes.length + 1);
  /** Les nœuds conservés gardent leur identifiant : les exécutions restent rattachées. */
  assert.equal(saved.body.workflow.nodes.find((n) => n.key === 'start').id, startId);
  assert.equal(saved.body.workflow.description, 'Édité depuis le concepteur');
});

test('l’accès projet est refusé hors membres et limité en lecture pour un VIEWER', async () => {
  assert.equal((await get(`/api/emonos/projects/${projectId}`, outsiderToken)).status, 404);
  assert.equal((await get(`/api/emonos/tasks?projectId=${projectId}`, outsiderToken)).status, 404);

  const added = await post(`/api/emonos/projects/${projectId}/members`, { userId: 'u-viewer', role: 'VIEWER' });
  assert.equal(added.status, 200);
  assert.equal((await get(`/api/emonos/projects/${projectId}`, viewerToken)).status, 200);
  const write = await post('/api/emonos/tasks', { projectId, title: 'Interdit' }, viewerToken);
  assert.equal(write.status, 403);

  /** Un MEMBER écrit mais n'administre pas. */
  const memberWrite = await post('/api/emonos/tasks', { projectId, title: 'Note de cadrage' }, memberToken);
  assert.equal(memberWrite.status, 201);
  const memberAdmin = await del(`/api/emonos/projects/${projectId}`, memberToken);
  assert.equal(memberAdmin.status, 403);
  assert.equal((await del(`/api/emonos/tasks/${memberWrite.body.task.id}`, memberToken)).status, 200);
});

test('le mode de dates AUTOMATIC calcule l’échéance depuis la durée du modèle', async () => {
  const created = await post('/api/emonos/projects', {
    name: 'Marché public 2026',
    kind: 'CALL_FOR_TENDER',
    dateMode: 'AUTOMATIC',
    startDate: '2026-02-01T00:00:00.000Z',
    teamId: 'auto',
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.project.dueDate.slice(0, 10), '2026-03-18');
  assert.equal(created.body.project.team.name, 'Team of super dev');

  const withoutDates = await post('/api/emonos/projects', {
    name: 'Sans date',
    kind: 'COMPANY_MGMT',
    dateMode: 'NONE',
    applyBlueprint: false,
  });
  assert.equal(withoutDates.status, 201);
  assert.equal(withoutDates.body.project.startDate, null);
  assert.equal(withoutDates.body.created.tasks, 0);

  const inverted = await post('/api/emonos/projects', {
    name: 'Dates inversées', kind: 'SOFTWARE_DEV', dateMode: 'FIXED',
    startDate: '2026-05-01T00:00:00.000Z', dueDate: '2026-04-01T00:00:00.000Z',
  });
  assert.equal(inverted.status, 400);
});

test('la liste des projets se regroupe par priorité, responsable ou étape', async () => {
  const grouped = await get('/api/emonos/projects?groupBy=priority');
  assert.equal(grouped.status, 200);
  assert.equal(grouped.body.groupBy, 'priority');
  assert.equal(grouped.body.groups.every((g) => g.projects.length > 0), true);

  const byStage = await get('/api/emonos/projects?groupBy=stage');
  assert.equal(byStage.body.groups.some((g) => g.key === 'DEVELOPMENT'), true);

  const byOwner = await get('/api/emonos/projects?groupBy=owner');
  assert.equal(byOwner.body.groups[0].label, 'Awa');

  /** Un projet archivé sort de la liste par défaut. */
  const archived = await post('/api/emonos/projects', { name: 'À archiver', kind: 'SOFTWARE_DEV', dateMode: 'NONE', applyBlueprint: false });
  await patch(`/api/emonos/projects/${archived.body.project.id}`, { archived: true });
  const active = await get('/api/emonos/projects');
  assert.equal(active.body.projects.some((p) => p.id === archived.body.project.id), false);
  const archivedList = await get('/api/emonos/projects?archived=1');
  assert.equal(archivedList.body.projects.some((p) => p.id === archived.body.project.id), true);
  assert.equal((await del(`/api/emonos/projects/${archived.body.project.id}`)).status, 200);
});

test('la timeline expose la fenêtre du Gantt et les tâches datées', async () => {
  const timeline = await get(`/api/emonos/projects/${projectId}/timeline`);
  assert.equal(timeline.status, 200);
  assert.equal(timeline.body.project.name, 'LOGOS');
  assert.equal(timeline.body.window.start.slice(0, 10), '2026-01-05');
  assert.equal(timeline.body.tasks.every((t) => typeof t.title === 'string'), true);
  assert.equal((await get(`/api/emonos/projects/${projectId}/timeline`, outsiderToken)).status, 404);
});

test('modèles de documents et documents de projet', async () => {
  const templates = await get(`/api/emonos/templates?projectKind=SOFTWARE_DEV`);
  assert.equal(templates.status, 200);
  assert.equal(templates.body.templates.some((t) => t.name === 'Spécification fonctionnelle'), true);

  const created = await post('/api/emonos/templates', {
    name: 'Plan de test', category: 'recette', bodyMarkdown: '# Plan de test\n', projectKind: 'SOFTWARE_DEV',
  });
  assert.equal(created.status, 201);
  assert.equal((await post('/api/emonos/templates', { name: 'Plan de test', category: 'recette' })).status, 409);

  const doc = await post('/api/emonos/documents', { projectId, templateId: created.body.template.id });
  assert.equal(doc.status, 201);
  assert.equal(doc.body.document.title, 'Plan de test');
  /** Les contenus sont normalisés (espaces de bord retirés) à l'enregistrement. */
  assert.equal(doc.body.document.bodyMarkdown, '# Plan de test');

  const edited = await patch(`/api/emonos/documents/${doc.body.document.id}`, { bodyMarkdown: '# Plan de test\n\n## Périmètre\n' });
  assert.equal(edited.status, 200);
  assert.equal((await get(`/api/emonos/documents/${doc.body.document.id}`, outsiderToken)).status, 404);
  assert.equal((await del(`/api/emonos/documents/${doc.body.document.id}`)).status, 200);
});

test('équipes : création, membres et garde-fou sur le dernier responsable', async () => {
  const team = await post('/api/emonos/teams', { name: 'Administrative staff', description: 'Back-office' });
  assert.equal(team.status, 201);
  const teamId = team.body.team.id;
  assert.equal((await post('/api/emonos/teams', { name: 'Administrative staff' })).status, 409);

  const added = await post(`/api/emonos/teams/${teamId}/members`, { email: 'member@example.com', role: 'MANAGER' });
  assert.equal(added.status, 200);
  assert.equal(added.body.member.user.displayName, 'Koffi');

  const outsiderPatch = await patch(`/api/emonos/teams/${teamId}`, { name: 'Pirate' }, outsiderToken);
  assert.equal(outsiderPatch.status, 403);

  assert.equal((await del(`/api/emonos/teams/${teamId}/members/u-member`)).status, 200);
  /** Le dernier responsable ne peut pas être retiré. */
  assert.equal((await del(`/api/emonos/teams/${teamId}/members/u-owner`)).status, 409);
  assert.equal((await del(`/api/emonos/teams/${teamId}`)).status, 200);
});

test('GET /api/emonos/bootstrap ne montre que les projets accessibles', async () => {
  const owner = await get('/api/emonos/bootstrap');
  assert.equal(owner.status, 200);
  assert.equal(owner.body.blueprints.length, 3);
  assert.equal(owner.body.projects.length >= 3, true);

  const outsider = await get('/api/emonos/bootstrap', outsiderToken);
  assert.equal(outsider.status, 200);
  assert.equal(outsider.body.projects.length, 0);
  assert.equal((await get('/api/emonos/bootstrap', null)).status, 401);
});

test('supprimer un projet emporte ses tâches, documents et exécutions', async () => {
  const created = await post('/api/emonos/projects', { name: 'Éphémère', kind: 'SOFTWARE_DEV', dateMode: 'NONE' });
  const id = created.body.project.id;
  assert.equal((await get(`/api/emonos/tasks?projectId=${id}&pageSize=100`)).body.total > 0, true);
  assert.equal((await del(`/api/emonos/projects/${id}`)).status, 200);
  assert.equal((await get(`/api/emonos/projects/${id}`)).status, 404);
  assert.equal((await get(`/api/emonos/tasks?projectId=${id}`)).status, 404);
});
