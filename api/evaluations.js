import { prisma } from './_lib/prisma.js';
import { requireUser } from './_lib/auth.js';
import { readJsonBody, sendJson, setCors } from './_lib/http.js';

function cleanChoiceIds(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item).trim()).filter(Boolean))].sort();
}

function sameChoices(left, right) {
  const a = cleanChoiceIds(left);
  const b = cleanChoiceIds(right);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function cleanCode(value) {
  return String(value || '').replace(/\r\n?/g, '\n').split('\n').map((line) => line.trimEnd()).join('\n').trim();
}

function publicAttempt(attempt) {
  return {
    id: attempt.id,
    lessonId: attempt.lessonId,
    exerciseId: attempt.exerciseId,
    score: attempt.score,
    maxScore: attempt.maxScore,
    status: attempt.status,
    feedback: attempt.feedback,
    createdAt: attempt.createdAt,
  };
}

async function authenticated(req, res) {
  const auth = await requireUser(req);
  if (auth.error) {
    sendJson(res, auth.status, { error: auth.error });
    return null;
  }
  return auth.user;
}

export async function submitQuiz(req, res) {
  setCors(res);
  try {
    const user = await authenticated(req, res);
    if (!user) return;
    const lessonId = String(req.params?.lessonId || '').trim();
    const lesson = await prisma.lesson.findFirst({
      where: {
        lessonId,
        kind: 'QUIZ',
        published: true,
        module: { is: { published: true, track: { published: true } } },
      },
      select: {
        lessonId: true,
        quizQuestions: {
          orderBy: { position: 'asc' },
          select: { id: true, correctChoiceIds: true, explanation: true, points: true },
        },
      },
    });
    if (!lesson) return sendJson(res, 404, { error: 'Quiz introuvable' });

    const body = await readJsonBody(req);
    const submitted = new Map(
      (Array.isArray(body.answers) ? body.answers : []).map((answer) => [String(answer?.questionId || ''), answer?.choiceIds]),
    );
    let score = 0;
    const feedback = lesson.quizQuestions.map((question) => {
      const correct = sameChoices(submitted.get(question.id), question.correctChoiceIds);
      if (correct) score += question.points;
      return { questionId: question.id, correct, explanation: question.explanation };
    });
    const maxScore = lesson.quizQuestions.reduce((total, question) => total + question.points, 0);
    const status = maxScore > 0 && score === maxScore ? 'PASSED' : 'FAILED';
    const attempt = await prisma.attempt.create({
      data: {
        userId: user.id,
        lessonId: lesson.lessonId,
        payload: { answers: Array.isArray(body.answers) ? body.answers : [] },
        score,
        maxScore,
        status,
        feedback,
      },
    });
    const result = publicAttempt(attempt);
    return sendJson(res, 201, {
      attemptId: result.id,
      score: result.score,
      maxScore: result.maxScore,
      status: result.status,
      feedback: result.feedback,
      attempt: result,
    });
  } catch (error) {
    console.error('[quiz:submit]', error);
    return sendJson(res, 500, { error: 'Erreur serveur' });
  }
}

export async function submitExercise(req, res) {
  setCors(res);
  try {
    const user = await authenticated(req, res);
    if (!user) return;
    const exerciseId = String(req.params?.exerciseId || '').trim();
    const exercise = await prisma.exercise.findFirst({
      where: {
        id: exerciseId,
        lesson: {
          is: {
            kind: 'EXERCISE', published: true,
            module: { is: { published: true, track: { published: true } } },
          },
        },
      },
      select: { id: true, lessonId: true, solutionCode: true, tests: true, points: true },
    });
    if (!exercise) return sendJson(res, 404, { error: 'Exercice introuvable' });

    const body = await readJsonBody(req);
    const code = typeof body.code === 'string' ? body.code : '';
    if (!code.trim() || code.length > 50_000) {
      return sendJson(res, 400, { error: 'Code invalide' });
    }
    const hasCorrection = Boolean(exercise.solutionCode);
    const passed = hasCorrection && cleanCode(code) === cleanCode(exercise.solutionCode);
    const status = hasCorrection ? (passed ? 'PASSED' : 'FAILED') : 'PENDING_REVIEW';
    const score = passed ? exercise.points : 0;
    const publicTestCount = Array.isArray(exercise.tests)
      ? exercise.tests.filter((item) => item && item.hidden !== true).length
      : 0;
    const feedback = {
      message: hasCorrection
        ? passed ? 'Solution validée.' : 'La solution ne satisfait pas encore les critères.'
        : 'Solution reçue pour vérification.',
      publicTests: Array.from({ length: publicTestCount }, (_, index) => ({ index: index + 1, passed })),
    };
    const attempt = await prisma.attempt.create({
      data: {
        userId: user.id,
        lessonId: exercise.lessonId,
        exerciseId: exercise.id,
        payload: { code },
        score,
        maxScore: exercise.points,
        status,
        feedback,
      },
    });
    const result = publicAttempt(attempt);
    return sendJson(res, 201, {
      attemptId: result.id,
      score: result.score,
      maxScore: result.maxScore,
      status: result.status,
      feedback: result.feedback,
      attempt: result,
    });
  } catch (error) {
    console.error('[exercise:submit]', error);
    return sendJson(res, 500, { error: 'Erreur serveur' });
  }
}

export async function listAttempts(req, res) {
  setCors(res);
  try {
    const user = await authenticated(req, res);
    if (!user) return;
    const attempts = await prisma.attempt.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, lessonId: true, exerciseId: true, score: true, maxScore: true,
        status: true, feedback: true, createdAt: true,
      },
    });
    return sendJson(res, 200, { attempts });
  } catch (error) {
    console.error('[attempts:list]', error);
    return sendJson(res, 500, { error: 'Erreur serveur' });
  }
}
