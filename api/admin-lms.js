import { prisma } from './_lib/prisma.js';
import { requireAdmin } from './_lib/auth.js';
import { readJsonBody, sendJson, setCors } from './_lib/http.js';

const DISCIPLINES = new Set(['MATH', 'PYTHON', 'ML', 'DEEP', 'NLP', 'SOFT']);
const SEGMENTS = new Set(['COLLEGE', 'LYCEE']);
const STATUSES = new Set(['PASSED', 'FAILED', 'PENDING_REVIEW']);

async function admin(req, res) {
  const auth = await requireAdmin(req);
  if (auth.error) {
    sendJson(res, auth.status, { error: auth.error });
    return null;
  }
  return auth.user;
}

function textValue(value, max = 500) {
  if (typeof value !== 'string') return null;
  const result = value.trim();
  return result && result.length <= max ? result : null;
}

function optionalText(value, max = 10_000) {
  if (value === null || value === undefined || value === '') return null;
  return textValue(value, max);
}

function positiveInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function databaseError(res, error, label) {
  if (error?.code === 'P2002') return sendJson(res, 409, { error: `${label} déjà utilisé` });
  if (error?.code === 'P2025') return sendJson(res, 404, { error: `${label} introuvable` });
  console.error('[admin:lms]', error);
  return sendJson(res, 500, { error: 'Erreur serveur' });
}

export async function adminListTracks(req, res) {
  setCors(res);
  try {
    if (!await admin(req, res)) return;
    const tracks = await prisma.track.findMany({
      orderBy: { position: 'asc' },
      include: {
        modules: { orderBy: { position: 'asc' }, include: { _count: { select: { lessons: true } } } },
        _count: { select: { enrollments: true, projects: true } },
      },
    });
    return sendJson(res, 200, { tracks });
  } catch (error) {
    return databaseError(res, error, 'Parcours');
  }
}

export async function adminCreateTrack(req, res) {
  setCors(res);
  try {
    if (!await admin(req, res)) return;
    const body = await readJsonBody(req);
    const slug = textValue(body.slug, 100);
    const title = textValue(body.title, 300);
    const discipline = String(body.discipline || '').toUpperCase();
    const segment = String(body.segment || '').toUpperCase();
    if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !title || !DISCIPLINES.has(discipline) || !SEGMENTS.has(segment)) {
      return sendJson(res, 400, { error: 'Parcours invalide' });
    }
    let position = positiveInteger(body.position);
    if (!position) {
      const aggregate = await prisma.track.aggregate({ _max: { position: true } });
      position = (aggregate._max.position || 0) + 1;
    }
    const track = await prisma.track.create({
      data: {
        slug, title, discipline, segment, position,
        summary: optionalText(body.summary),
        published: body.published === true,
        prerequisiteTrackId: optionalText(body.prerequisiteTrackId, 100),
      },
    });
    return sendJson(res, 201, { track });
  } catch (error) {
    return databaseError(res, error, 'Parcours');
  }
}

export async function adminPatchTrack(req, res) {
  setCors(res);
  try {
    if (!await admin(req, res)) return;
    const body = await readJsonBody(req);
    const data = {};
    if ('title' in body) data.title = textValue(body.title, 300);
    if ('summary' in body) data.summary = optionalText(body.summary);
    if ('position' in body) data.position = positiveInteger(body.position);
    if ('published' in body && typeof body.published === 'boolean') data.published = body.published;
    if ('discipline' in body && DISCIPLINES.has(String(body.discipline).toUpperCase())) data.discipline = String(body.discipline).toUpperCase();
    if ('segment' in body && SEGMENTS.has(String(body.segment).toUpperCase())) data.segment = String(body.segment).toUpperCase();
    if ('prerequisiteTrackId' in body) data.prerequisiteTrackId = optionalText(body.prerequisiteTrackId, 100);
    if (!Object.keys(data).length || ('title' in data && !data.title) || ('position' in data && !data.position)) {
      return sendJson(res, 400, { error: 'Modification invalide' });
    }
    const track = await prisma.track.update({ where: { id: String(req.params?.id || '') }, data });
    return sendJson(res, 200, { track });
  } catch (error) {
    return databaseError(res, error, 'Parcours');
  }
}

export async function adminCreateModule(req, res) {
  setCors(res);
  try {
    if (!await admin(req, res)) return;
    const body = await readJsonBody(req);
    const trackId = textValue(body.trackId, 100);
    const title = textValue(body.title, 300);
    if (!trackId || !title || !await prisma.track.findUnique({ where: { id: trackId }, select: { id: true } })) {
      return sendJson(res, 400, { error: 'Module invalide' });
    }
    let position = positiveInteger(body.position);
    if (!position) {
      const aggregate = await prisma.module.aggregate({ where: { trackId }, _max: { position: true } });
      position = (aggregate._max.position || 0) + 1;
    }
    const module = await prisma.module.create({
      data: { trackId, title, position, summary: optionalText(body.summary), published: body.published === true },
    });
    return sendJson(res, 201, { module });
  } catch (error) {
    return databaseError(res, error, 'Module');
  }
}

export async function adminPatchModule(req, res) {
  setCors(res);
  try {
    if (!await admin(req, res)) return;
    const body = await readJsonBody(req);
    const data = {};
    if ('title' in body) data.title = textValue(body.title, 300);
    if ('summary' in body) data.summary = optionalText(body.summary);
    if ('position' in body) data.position = positiveInteger(body.position);
    if ('published' in body && typeof body.published === 'boolean') data.published = body.published;
    if (!Object.keys(data).length || ('title' in data && !data.title) || ('position' in data && !data.position)) {
      return sendJson(res, 400, { error: 'Modification invalide' });
    }
    const module = await prisma.module.update({ where: { id: String(req.params?.id || '') }, data });
    return sendJson(res, 200, { module });
  } catch (error) {
    return databaseError(res, error, 'Module');
  }
}

export async function adminCreateExercise(req, res) {
  setCors(res);
  try {
    if (!await admin(req, res)) return;
    const body = await readJsonBody(req);
    const lessonId = textValue(body.lessonId, 200);
    const lesson = lessonId ? await prisma.lesson.findUnique({ where: { lessonId }, select: { kind: true } }) : null;
    const prompt = textValue(body.prompt, 20_000);
    if (lesson?.kind !== 'EXERCISE' || !prompt || !Array.isArray(body.tests)) {
      return sendJson(res, 400, { error: 'Exercice invalide' });
    }
    let position = positiveInteger(body.position);
    if (!position) {
      const aggregate = await prisma.exercise.aggregate({ where: { lessonId }, _max: { position: true } });
      position = (aggregate._max.position || 0) + 1;
    }
    const exercise = await prisma.exercise.create({
      data: {
        lessonId, position, prompt, tests: body.tests,
        starterCode: optionalText(body.starterCode, 50_000),
        solutionCode: optionalText(body.solutionCode, 50_000),
        hints: Array.isArray(body.hints) ? body.hints : null,
        points: positiveInteger(body.points) || 10,
      },
    });
    return sendJson(res, 201, { exercise });
  } catch (error) {
    return databaseError(res, error, 'Exercice');
  }
}

export async function adminCreateQuizQuestion(req, res) {
  setCors(res);
  try {
    if (!await admin(req, res)) return;
    const body = await readJsonBody(req);
    const lessonId = textValue(body.lessonId, 200);
    const lesson = lessonId ? await prisma.lesson.findUnique({ where: { lessonId }, select: { kind: true } }) : null;
    const prompt = textValue(body.prompt, 20_000);
    const choices = Array.isArray(body.choices) ? body.choices : [];
    const choiceIds = new Set(choices.map((choice) => String(choice?.id || '')).filter(Boolean));
    const correctChoiceIds = Array.isArray(body.correctChoiceIds)
      ? [...new Set(body.correctChoiceIds.map((id) => String(id)))]
      : [];
    if (lesson?.kind !== 'QUIZ' || !prompt || choices.length < 2 || !correctChoiceIds.length
      || correctChoiceIds.some((id) => !choiceIds.has(id))) {
      return sendJson(res, 400, { error: 'Question invalide' });
    }
    let position = positiveInteger(body.position);
    if (!position) {
      const aggregate = await prisma.quizQuestion.aggregate({ where: { lessonId }, _max: { position: true } });
      position = (aggregate._max.position || 0) + 1;
    }
    const question = await prisma.quizQuestion.create({
      data: {
        lessonId, position, prompt, choices, correctChoiceIds,
        explanation: optionalText(body.explanation, 20_000),
        points: positiveInteger(body.points) || 1,
      },
    });
    return sendJson(res, 201, { question });
  } catch (error) {
    return databaseError(res, error, 'Question');
  }
}

export async function adminListSubmissions(req, res) {
  setCors(res);
  try {
    if (!await admin(req, res)) return;
    const submissions = await prisma.projectSubmission.findMany({
      orderBy: { submittedAt: 'desc' },
      include: {
        project: { select: { id: true, title: true } },
        user: { select: { id: true, email: true, displayName: true } },
        reviewer: { select: { id: true, email: true, displayName: true } },
      },
    });
    return sendJson(res, 200, { submissions });
  } catch (error) {
    return databaseError(res, error, 'Soumission');
  }
}

export async function adminPatchSubmission(req, res) {
  setCors(res);
  try {
    const reviewer = await admin(req, res);
    if (!reviewer) return;
    const body = await readJsonBody(req);
    const status = String(body.status || '').toUpperCase();
    const score = Number(body.score);
    if (!STATUSES.has(status) || !Number.isInteger(score) || score < 0) {
      return sendJson(res, 400, { error: 'Évaluation invalide' });
    }
    const submission = await prisma.projectSubmission.update({
      where: { id: String(req.params?.id || '') },
      data: { status, score, reviewerId: reviewer.id, reviewedAt: new Date() },
      include: {
        project: { select: { id: true, title: true } },
        user: { select: { id: true, email: true, displayName: true } },
        reviewer: { select: { id: true, email: true, displayName: true } },
      },
    });
    return sendJson(res, 200, { submission });
  } catch (error) {
    return databaseError(res, error, 'Soumission');
  }
}
