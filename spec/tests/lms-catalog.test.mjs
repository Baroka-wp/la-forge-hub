import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

const DB_NAME = 'laforge_lms_catalog_spec';
const DATABASE_URL = `postgresql://baroka@127.0.0.1:5432/${DB_NAME}`;
process.env.DATABASE_URL = DATABASE_URL;
process.env.JWT_SECRET = 'catalog-spec-secret-that-is-long-enough';

function psql(database, sql) {
  return execFileSync('psql', ['-v', 'ON_ERROR_STOP=1', '-d', database, '-Atqc', sql], { encoding: 'utf8' }).trim();
}

let server;
let baseUrl;
let token;
let otherToken;
let adminToken;

test.before(async () => {
  psql('postgres', `DROP DATABASE IF EXISTS ${DB_NAME}`);
  psql('postgres', `CREATE DATABASE ${DB_NAME}`);
  execFileSync('node', ['node_modules/prisma/build/index.js', 'db', 'push', '--skip-generate'], {
    env: { ...process.env, DATABASE_URL }, stdio: 'pipe',
  });
  psql(DB_NAME, `
    ALTER TABLE users ALTER COLUMN updated_at SET DEFAULT now();
    ALTER TABLE tracks ALTER COLUMN updated_at SET DEFAULT now();
    ALTER TABLE modules ALTER COLUMN updated_at SET DEFAULT now();
    ALTER TABLE lessons ALTER COLUMN updated_at SET DEFAULT now();
    ALTER TABLE exercises ALTER COLUMN updated_at SET DEFAULT now();
    ALTER TABLE quiz_questions ALTER COLUMN updated_at SET DEFAULT now();
    ALTER TABLE projects ALTER COLUMN updated_at SET DEFAULT now();
    INSERT INTO users(id,email,password_hash,display_name,role,auth_version)
      VALUES ('catalog-user','catalog@example.com','hash','Awa','learner',0),
             ('catalog-other','other@example.com','hash','Koffi','learner',0),
             ('catalog-admin','admin@example.com','hash','Admin','admin',0);
    INSERT INTO tracks(id,slug,title,summary,discipline,segment,position,published)
      VALUES ('t-public','python-lycee','Python au lycée','Parcours publié','PYTHON','LYCEE',1,true),
             ('t-draft','ml-college-brouillon','ML brouillon','Invisible','ML','COLLEGE',2,false);
    INSERT INTO modules(id,track_id,title,position,published)
      VALUES ('m-public','t-public','Premiers pas',1,true),
             ('m-hidden','t-public','Module brouillon',2,false),
             ('m-draft','t-draft','Invisible',1,true);
    INSERT INTO lessons(lesson_id,course_slug,module_id,kind,position,title,description,youtube_id,tag,body_markdown,published)
      VALUES ('video-public','python-lycee','m-public','VIDEO',1,'Vidéo publiée','Visible','abcDEF123','python',NULL,true),
             ('reading-public','python-lycee','m-public','READING',2,'Lire Python','Visible',NULL,'python','# Bonjour',true),
             ('exercise-public','python-lycee','m-public','EXERCISE',3,'Exercice Python','Visible',NULL,'python',NULL,true),
             ('quiz-public','python-lycee','m-public','QUIZ',4,'Quiz Python','Visible',NULL,'python',NULL,true),
             ('lesson-hidden','python-lycee','m-public','VIDEO',5,'Leçon brouillon','Invisible','secretYT','python',NULL,false),
             ('hidden-module-lesson','python-lycee','m-hidden','VIDEO',6,'Module invisible','Invisible','hiddenYT','python',NULL,true),
             ('draft-track-lesson','ml-college-brouillon','m-draft','VIDEO',7,'Parcours invisible','Invisible','draftYT','ml',NULL,true);
    INSERT INTO exercises(id,lesson_id,position,prompt,starter_code,solution_code,tests,hints,points)
      VALUES ('ex1','exercise-public',1,'Additionne deux nombres','def add(a,b): pass','def add(a,b): return a+b',
        '[{"input":[1,2],"expected":3,"hidden":false},{"input":[40,2],"expected":42,"hidden":true}]'::jsonb,
        '["Pense à +"]'::jsonb,10);
    INSERT INTO quiz_questions(id,lesson_id,position,prompt,choices,correct_choice_ids,explanation,points)
      VALUES ('q1','quiz-public',1,'Python est…','[{"id":"a","label":"un langage"},{"id":"b","label":"un navigateur"}]'::jsonb,
        '["a"]'::jsonb,'Python est un langage.',2);
    INSERT INTO enrollments(id,user_id,course_slug,track_id)
      VALUES ('enrollment-catalog','catalog-user','python-lycee','t-public');
    INSERT INTO lesson_progress(user_id,lesson_id,completed,last_position_sec,updated_at)
      VALUES ('catalog-user','reading-public',true,120,now()),
             ('catalog-user','video-public',false,30,now()),
             ('catalog-other','reading-public',false,300,now());
    INSERT INTO projects(id,lesson_id,track_id,title,brief,rubric,published)
      VALUES ('project-public',NULL,'t-public','Mini-projet Python','Construire un outil','[{"criterion":"Clarté","points":10}]'::jsonb,true),
             ('project-hidden',NULL,'t-public','Projet brouillon','Invisible','[]'::jsonb,false);
    INSERT INTO badges(id,code,label,description,rule)
      VALUES ('badge-first-lesson','FIRST_LESSON','Premier pas','Terminer une première leçon',
        '{"type":"LESSONS_COMPLETED","count":1}'::jsonb);
  `);

  const express = (await import('express')).default;
  const { registerApiRoutes } = await import('../../server/api-routes.mjs');
  const { signToken } = await import('../../api/_lib/jwt.js');
  token = signToken({ sub: 'catalog-user', av: 0 });
  otherToken = signToken({ sub: 'catalog-other', av: 0 });
  adminToken = signToken({ sub: 'catalog-admin', av: 0 });
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

async function get(path, authenticated = false) {
  const authToken = typeof authenticated === 'string' ? authenticated : authenticated ? token : null;
  const response = await fetch(`${baseUrl}${path}`, { headers: authToken ? { Authorization: `Bearer ${authToken}` } : {} });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

async function post(path, payload, authToken = token) {
  return request('POST', path, payload, authToken);
}

async function request(method, path, payload, authToken = token) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

test('GET /api/tracks ne renvoie que les parcours publies et accepte les filtres', async () => {
  const all = await get('/api/tracks');
  assert.equal(all.status, 200);
  assert.equal(all.body.tracks.length, 1);
  assert.equal(all.body.tracks[0].slug, 'python-lycee');
  assert.equal(all.body.tracks[0].moduleCount, 1);
  assert.equal(all.body.tracks[0].lessonCount, 4);
  assert.equal((await get('/api/tracks?segment=COLLEGE')).body.tracks.length, 0);
  assert.equal((await get('/api/tracks?discipline=PYTHON')).body.tracks.length, 1);
});

test('GET /api/tracks/:slug masque parcours, modules et lecons non publies', async () => {
  const result = await get('/api/tracks/python-lycee');
  assert.equal(result.status, 200);
  assert.equal(result.body.track.modules.length, 1);
  assert.deepEqual(result.body.track.modules[0].lessons.map((lesson) => lesson.lessonId), [
    'video-public', 'reading-public', 'exercise-public', 'quiz-public',
  ]);
  assert.equal(JSON.stringify(result.body).includes('solutionCode'), false);
  assert.equal(JSON.stringify(result.body).includes('correctChoiceIds'), false);
  assert.equal((await get('/api/tracks/ml-college-brouillon')).status, 404);
});

test('GET /api/lessons/:lessonId exige une session et adapte le contenu au type', async () => {
  assert.equal((await get('/api/lessons/reading-public')).status, 401);
  const reading = await get('/api/lessons/reading-public', true);
  assert.equal(reading.status, 200);
  assert.equal(reading.body.lesson.bodyMarkdown, '# Bonjour');

  const exercise = await get('/api/lessons/exercise-public', true);
  assert.equal(exercise.status, 200);
  assert.equal(exercise.body.lesson.exercises[0].solutionCode, undefined);
  assert.equal(exercise.body.lesson.exercises[0].tests.length, 1);
  assert.equal(exercise.body.lesson.exercises[0].tests.some((item) => item.hidden), false);

  const quiz = await get('/api/lessons/quiz-public', true);
  assert.equal(quiz.status, 200);
  assert.equal(quiz.body.lesson.questions[0].correctChoiceIds, undefined);
  assert.equal(quiz.body.lesson.questions[0].explanation, undefined);
  assert.equal((await get('/api/lessons/lesson-hidden', true)).status, 404);
});

test('GET /api/lessons historique reste compatible et exclut les brouillons', async () => {
  const result = await get('/api/lessons?course=python-lycee');
  assert.equal(result.status, 200);
  assert.equal(result.body.lessons.length, 4);
  assert.equal(typeof result.body.lessons[0].lessonId, 'string');
  assert.equal('kind' in result.body.lessons[0], true);
});

test('POST /api/quiz/:lessonId/submit calcule le score sur le serveur et cree chaque tentative', async () => {
  assert.equal((await post('/api/quiz/quiz-public/submit', { answers: [] }, null)).status, 401);

  const passed = await post('/api/quiz/quiz-public/submit', {
    answers: [{ questionId: 'q1', choiceIds: ['a'] }],
    score: 999,
    maxScore: 999,
  });
  assert.equal(passed.status, 201);
  assert.equal(passed.body.attempt.score, 2);
  assert.equal(passed.body.attempt.maxScore, 2);
  assert.equal(passed.body.attempt.status, 'PASSED');
  assert.equal(JSON.stringify(passed.body).includes('correctChoiceIds'), false);

  const failed = await post('/api/quiz/quiz-public/submit', {
    answers: [{ questionId: 'q1', choiceIds: ['b'] }],
  });
  assert.equal(failed.status, 201);
  assert.equal(failed.body.attempt.score, 0);
  assert.equal(failed.body.attempt.status, 'FAILED');
  assert.notEqual(failed.body.attempt.id, passed.body.attempt.id);
});

test('POST /api/exercises/:exerciseId/submit corrige sans exposer solution ni tests caches', async () => {
  const passed = await post('/api/exercises/ex1/submit', {
    code: 'def add(a,b): return a+b',
    score: 999,
  });
  assert.equal(passed.status, 201);
  assert.equal(passed.body.attempt.score, 10);
  assert.equal(passed.body.attempt.maxScore, 10);
  assert.equal(passed.body.attempt.status, 'PASSED');

  const failed = await post('/api/exercises/ex1/submit', { code: 'def add(a,b): return 0' });
  assert.equal(failed.status, 201);
  assert.equal(failed.body.attempt.score, 0);
  assert.equal(failed.body.attempt.status, 'FAILED');
  const serialized = JSON.stringify([passed.body, failed.body]);
  assert.equal(serialized.includes('solutionCode'), false);
  assert.equal(serialized.includes('"input":[40,2]'), false);
});

test('GET /api/attempts retourne uniquement l historique de l utilisateur connecte', async () => {
  await post('/api/quiz/quiz-public/submit', {
    answers: [{ questionId: 'q1', choiceIds: ['a'] }],
  }, otherToken);

  assert.equal((await get('/api/attempts')).status, 401);
  const mine = await get('/api/attempts', true);
  assert.equal(mine.status, 200);
  assert.equal(mine.body.attempts.length, 4);
  assert.equal(mine.body.attempts.every((attempt) => attempt.userId === undefined), true);
  assert.equal(mine.body.attempts.some((attempt) => attempt.score === 999), false);
});

test('POST /api/projects/:projectId/submit force la revue serveur et masque les brouillons', async () => {
  assert.equal((await post('/api/projects/project-public/submit', { notes: 'Mon travail' }, null)).status, 401);
  assert.equal((await post('/api/projects/project-hidden/submit', { notes: 'Essai' })).status, 404);

  const result = await post('/api/projects/project-public/submit', {
    repoUrl: 'https://github.com/example/project',
    notebookUrl: 'https://colab.research.google.com/example',
    notes: 'Première version',
    status: 'PASSED',
    score: 100,
    reviewerId: 'catalog-user',
  });
  assert.equal(result.status, 201);
  assert.equal(result.body.submission.status, 'PENDING_REVIEW');
  assert.equal(result.body.submission.score, null);
  assert.equal(result.body.submission.reviewerId, undefined);
  assert.equal(result.body.submission.userId, undefined);
});

test('GET /api/me/progress consolide uniquement la progression et les badges du membre', async () => {
  assert.equal((await get('/api/me/progress')).status, 401);
  const first = await get('/api/me/progress', true);
  assert.equal(first.status, 200);
  assert.equal(first.body.tracks.length, 1);
  assert.equal(first.body.tracks[0].slug, 'python-lycee');
  assert.equal(first.body.tracks[0].completedLessons, 1);
  assert.equal(first.body.tracks[0].totalLessons, 4);
  assert.equal(first.body.tracks[0].modules[0].lessons.find((lesson) => lesson.lessonId === 'reading-public').completed, true);
  assert.deepEqual(first.body.badges.map((badge) => badge.code), ['FIRST_LESSON']);

  const second = await get('/api/me/progress', true);
  assert.equal(second.body.badges.length, 1);
  const other = await get('/api/me/progress', otherToken);
  assert.deepEqual(other.body.tracks, []);
  assert.deepEqual(other.body.badges, []);
});

test('administration LMS gere parcours, modules, exercices et questions avec un role admin', async () => {
  assert.equal((await request('GET', '/api/admin/tracks', undefined, token)).status, 403);
  const listed = await request('GET', '/api/admin/tracks', undefined, adminToken);
  assert.equal(listed.status, 200);
  assert.equal(listed.body.tracks.some((track) => track.slug === 'ml-college-brouillon'), true);

  const track = await request('POST', '/api/admin/tracks', {
    slug: 'math-college-test', title: 'Mathématiques test', discipline: 'MATH', segment: 'COLLEGE', published: false,
  }, adminToken);
  assert.equal(track.status, 201);
  const trackId = track.body.track.id;
  const patchedTrack = await request('PATCH', `/api/admin/tracks/${trackId}`, { published: true, summary: 'Parcours test' }, adminToken);
  assert.equal(patchedTrack.status, 200);
  assert.equal(patchedTrack.body.track.published, true);

  const module = await request('POST', '/api/admin/modules', {
    trackId, title: 'Module test', published: true,
  }, adminToken);
  assert.equal(module.status, 201);
  assert.equal((await request('PATCH', `/api/admin/modules/${module.body.module.id}`, { summary: 'Résumé' }, adminToken)).status, 200);

  const reading = await request('POST', '/api/admin/lessons', {
    lessonId: 'reading-admin-test', courseSlug: 'math-college-test', moduleId: module.body.module.id,
    kind: 'READING', title: 'Lecture test', tag: 'math', bodyMarkdown: '# Notions', published: false,
  }, adminToken);
  assert.equal(reading.status, 201);
  assert.equal(reading.body.lesson.youtubeId, null);
  assert.equal((await request('PATCH', '/api/admin/lessons/reading-admin-test', { kind: 'VIDEO' }, adminToken)).status, 400);

  const exercise = await request('POST', '/api/admin/exercises', {
    lessonId: 'exercise-public', prompt: 'Soustraire', solutionCode: 'def sub(a,b): return a-b', tests: [], points: 5,
  }, adminToken);
  assert.equal(exercise.status, 201);
  assert.equal(exercise.body.exercise.solutionCode.includes('return a-b'), true);

  const question = await request('POST', '/api/admin/quiz-questions', {
    lessonId: 'quiz-public', prompt: 'Deux plus deux ?',
    choices: [{ id: '3', label: '3' }, { id: '4', label: '4' }], correctChoiceIds: ['4'], points: 1,
  }, adminToken);
  assert.equal(question.status, 201);
  assert.deepEqual(question.body.question.correctChoiceIds, ['4']);
});

test('administration LMS isole et corrige les soumissions de projets', async () => {
  assert.equal((await request('GET', '/api/admin/submissions', undefined, token)).status, 403);
  const listed = await request('GET', '/api/admin/submissions', undefined, adminToken);
  assert.equal(listed.status, 200);
  const pending = listed.body.submissions.find((submission) => submission.projectId === 'project-public');
  assert.equal(pending.status, 'PENDING_REVIEW');
  assert.equal(pending.user.email, 'catalog@example.com');

  const reviewed = await request('PATCH', `/api/admin/submissions/${pending.id}`, {
    status: 'PASSED', score: 8, reviewerId: 'catalog-user',
  }, adminToken);
  assert.equal(reviewed.status, 200);
  assert.equal(reviewed.body.submission.status, 'PASSED');
  assert.equal(reviewed.body.submission.score, 8);
  assert.equal(reviewed.body.submission.reviewer.id, 'catalog-admin');
});
