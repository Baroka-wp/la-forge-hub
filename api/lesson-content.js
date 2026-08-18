import { prisma } from './_lib/prisma.js';
import { requireUser } from './_lib/auth.js';
import { sendJson, setCors } from './_lib/http.js';

function publicTests(value) {
  return Array.isArray(value) ? value.filter((item) => item && item.hidden !== true) : [];
}

export default async function getLessonContent(req, res) {
  setCors(res);
  try {
    const auth = await requireUser(req);
    if (auth.error) return sendJson(res, auth.status, { error: auth.error });
    const lessonId = String(req.params?.lessonId || '').trim();
    const lesson = await prisma.lesson.findFirst({
      where: { lessonId, published: true, module: { is: { published: true, track: { published: true } } } },
      select: {
        lessonId: true, title: true, description: true, position: true, kind: true, durationMin: true,
        tag: true, youtubeId: true, bodyMarkdown: true, collabUrl: true,
        exercises: {
          orderBy: { position: 'asc' },
          select: { id: true, position: true, prompt: true, starterCode: true, tests: true, hints: true, points: true },
        },
        quizQuestions: {
          orderBy: { position: 'asc' },
          select: { id: true, position: true, prompt: true, choices: true, points: true },
        },
        projects: {
          where: { published: true },
          select: { id: true, title: true, brief: true, rubric: true },
        },
      },
    });
    if (!lesson) return sendJson(res, 404, { error: 'Leçon introuvable' });
    if (lesson.kind === 'VIDEO' && !lesson.youtubeId) {
      return sendJson(res, 422, { error: 'Vidéo non configurée' });
    }
    const { quizQuestions, exercises, ...base } = lesson;
    return sendJson(res, 200, {
      lesson: {
        ...base,
        ...(lesson.kind === 'EXERCISE'
          ? { exercises: exercises.map((exercise) => ({ ...exercise, tests: publicTests(exercise.tests) })) }
          : {}),
        ...(lesson.kind === 'QUIZ' ? { questions: quizQuestions } : {}),
      },
    });
  } catch (error) {
    console.error('[lessons:content]', error);
    return sendJson(res, 500, { error: 'Erreur serveur' });
  }
}
