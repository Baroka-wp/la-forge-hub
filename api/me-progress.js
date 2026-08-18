import { prisma } from './_lib/prisma.js';
import { requireUser } from './_lib/auth.js';
import { sendJson, setCors } from './_lib/http.js';

function ruleReached(rule, metrics) {
  if (!rule || typeof rule !== 'object' || Array.isArray(rule)) return false;
  const threshold = Number(rule.count ?? rule.min ?? 1);
  if (!Number.isInteger(threshold) || threshold < 1) return false;
  switch (String(rule.type || '').toUpperCase()) {
    case 'LESSONS_COMPLETED': return metrics.completedLessons >= threshold;
    case 'ATTEMPTS_PASSED': return metrics.passedAttempts >= threshold;
    case 'PROJECTS_SUBMITTED': return metrics.submittedProjects >= threshold;
    case 'TRACKS_COMPLETED': return metrics.completedTracks >= threshold;
    default: return false;
  }
}

export async function getMyProgress(req, res) {
  setCors(res);
  try {
    const auth = await requireUser(req);
    if (auth.error) return sendJson(res, auth.status, { error: auth.error });
    const userId = auth.user.id;
    const [enrollments, lessonProgress, passedAttempts, submittedProjects, badges] = await Promise.all([
      prisma.enrollment.findMany({
        where: { userId, trackId: { not: null }, track: { published: true } },
        orderBy: { enrolledAt: 'asc' },
        select: {
          enrolledAt: true,
          track: {
            select: {
              id: true, slug: true, title: true, summary: true, discipline: true, segment: true,
              modules: {
                where: { published: true },
                orderBy: { position: 'asc' },
                select: {
                  id: true, title: true, position: true,
                  lessons: {
                    where: { published: true },
                    orderBy: { position: 'asc' },
                    select: { lessonId: true, title: true, kind: true, position: true },
                  },
                },
              },
            },
          },
        },
      }),
      prisma.lessonProgress.findMany({ where: { userId } }),
      prisma.attempt.count({ where: { userId, status: 'PASSED' } }),
      prisma.projectSubmission.count({ where: { userId } }),
      prisma.badge.findMany({ select: { id: true, rule: true } }),
    ]);
    const progressByLesson = new Map(lessonProgress.map((item) => [item.lessonId, item]));
    let completedTracks = 0;
    const tracks = enrollments.map(({ track, enrolledAt }) => {
      const modules = track.modules.map((module) => ({
        ...module,
        lessons: module.lessons.map((lesson) => {
          const progress = progressByLesson.get(lesson.lessonId);
          return {
            ...lesson,
            completed: progress?.completed === true,
            lastPositionSec: progress?.lastPositionSec || 0,
          };
        }),
      }));
      const lessons = modules.flatMap((module) => module.lessons);
      const completedLessons = lessons.filter((lesson) => lesson.completed).length;
      if (lessons.length > 0 && completedLessons === lessons.length) completedTracks += 1;
      return {
        id: track.id, slug: track.slug, title: track.title, summary: track.summary,
        discipline: track.discipline, segment: track.segment, enrolledAt,
        completedLessons, totalLessons: lessons.length,
        percent: lessons.length ? Math.round((completedLessons / lessons.length) * 100) : 0,
        modules,
      };
    });
    const metrics = {
      completedLessons: lessonProgress.filter((item) => item.completed).length,
      passedAttempts,
      submittedProjects,
      completedTracks,
    };
    const earnedBadgeIds = badges.filter((badge) => ruleReached(badge.rule, metrics)).map((badge) => badge.id);
    if (earnedBadgeIds.length) {
      await prisma.userBadge.createMany({
        data: earnedBadgeIds.map((badgeId) => ({ userId, badgeId })),
        skipDuplicates: true,
      });
    }
    const userBadges = await prisma.userBadge.findMany({
      where: { userId },
      orderBy: { awardedAt: 'asc' },
      select: {
        awardedAt: true,
        badge: { select: { code: true, label: true, description: true } },
      },
    });
    return sendJson(res, 200, {
      tracks,
      badges: userBadges.map(({ badge, awardedAt }) => ({ ...badge, awardedAt })),
    });
  } catch (error) {
    console.error('[me:progress]', error);
    return sendJson(res, 500, { error: 'Erreur serveur' });
  }
}
