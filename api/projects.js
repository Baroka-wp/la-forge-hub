import { prisma } from './_lib/prisma.js';
import { requireUser } from './_lib/auth.js';
import { readJsonBody, sendJson, setCors } from './_lib/http.js';

function optionalText(value, maxLength) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') return undefined;
  const cleaned = value.trim();
  return cleaned && cleaned.length <= maxLength ? cleaned : undefined;
}

function optionalUrl(value) {
  const cleaned = optionalText(value, 2_000);
  if (cleaned === null || cleaned === undefined) return cleaned;
  try {
    const url = new URL(cleaned);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export async function submitProject(req, res) {
  setCors(res);
  try {
    const auth = await requireUser(req);
    if (auth.error) return sendJson(res, auth.status, { error: auth.error });
    const projectId = String(req.params?.projectId || '').trim();
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        published: true,
        track: { select: { published: true } },
        lesson: {
          select: { published: true, module: { select: { published: true, track: { select: { published: true } } } } },
        },
      },
    });
    const visible = project?.published
      && (!project.track || project.track.published)
      && (!project.lesson || (project.lesson.published && project.lesson.module?.published && project.lesson.module.track.published));
    if (!visible) return sendJson(res, 404, { error: 'Projet introuvable' });

    const body = await readJsonBody(req);
    const repoUrl = optionalUrl(body.repoUrl);
    const notebookUrl = optionalUrl(body.notebookUrl);
    const notes = optionalText(body.notes, 10_000);
    if (repoUrl === undefined || notebookUrl === undefined || notes === undefined) {
      return sendJson(res, 400, { error: 'Soumission invalide' });
    }
    if (!repoUrl && !notebookUrl && !notes) {
      return sendJson(res, 400, { error: 'Ajoutez un lien ou une note' });
    }
    const submission = await prisma.projectSubmission.create({
      data: { projectId: project.id, userId: auth.user.id, repoUrl, notebookUrl, notes },
      select: {
        id: true, projectId: true, repoUrl: true, notebookUrl: true, notes: true,
        status: true, score: true, reviewedAt: true, submittedAt: true,
      },
    });
    return sendJson(res, 201, { submission });
  } catch (error) {
    console.error('[projects:submit]', error);
    return sendJson(res, 500, { error: 'Erreur serveur' });
  }
}
