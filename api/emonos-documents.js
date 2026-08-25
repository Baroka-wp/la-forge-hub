/**
 * EMONOS — modèles de documents et documents de projet
 * (« Documents templates » du deck).
 */
import { prisma } from './_lib/prisma.js';
import { requireUser } from './_lib/auth.js';
import { readJsonBody, sendJson, setCors } from './_lib/http.js';
import { enums, optionalText, query, requireProject, text } from './_lib/emonos.js';

const MAX_BODY = 200_000;

/** GET /api/emonos/templates?projectKind= */
export async function listTemplates(req, res) {
  setCors(res);
  try {
    const auth = await requireUser(req);
    if (auth.error) return sendJson(res, auth.status, { error: auth.error });
    const q = query(req);
    const where = {};
    const projectKind = q.projectKind ? enums.kind(q.projectKind, null) : null;
    if (q.projectKind && !projectKind) return sendJson(res, 400, { error: 'Type de projet inconnu' });
    if (projectKind) where.OR = [{ projectKind }, { projectKind: null }];
    const category = optionalText(q.category, 60);
    if (category) where.category = category;
    const templates = await prisma.documentTemplate.findMany({
      where,
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
    return sendJson(res, 200, { templates });
  } catch (error) {
    console.error('[emonos:templates:list]', error);
    return sendJson(res, 500, { error: 'Erreur serveur' });
  }
}

/** POST /api/emonos/templates */
export async function createTemplate(req, res) {
  setCors(res);
  try {
    const auth = await requireUser(req);
    if (auth.error) return sendJson(res, auth.status, { error: auth.error });
    const body = await readJsonBody(req);
    const name = text(body.name, 160);
    if (!name) return sendJson(res, 400, { error: 'Nom du modèle requis' });
    const category = text(body.category, 60) || 'general';
    const description = optionalText(body.description, 2_000);
    if (description === undefined) return sendJson(res, 400, { error: 'Description invalide' });
    const bodyMarkdown = optionalText(body.bodyMarkdown, MAX_BODY);
    if (bodyMarkdown === undefined) return sendJson(res, 400, { error: 'Contenu invalide' });
    const projectKind = body.projectKind ? enums.kind(body.projectKind, null) : null;
    if (body.projectKind && !projectKind) return sendJson(res, 400, { error: 'Type de projet inconnu' });

    const existing = await prisma.documentTemplate.findUnique({ where: { name_category: { name, category } } });
    if (existing) return sendJson(res, 409, { error: 'Un modèle porte déjà ce nom dans cette catégorie' });
    const template = await prisma.documentTemplate.create({
      data: { name, category, description, projectKind, bodyMarkdown: bodyMarkdown || '' },
    });
    return sendJson(res, 201, { template });
  } catch (error) {
    console.error('[emonos:templates:create]', error);
    return sendJson(res, 500, { error: 'Erreur serveur' });
  }
}

/** PATCH /api/emonos/templates/:id */
export async function patchTemplate(req, res) {
  setCors(res);
  try {
    const auth = await requireUser(req);
    if (auth.error) return sendJson(res, auth.status, { error: auth.error });
    const id = String(req.params?.id || '');
    const template = await prisma.documentTemplate.findUnique({ where: { id } });
    if (!template) return sendJson(res, 404, { error: 'Modèle introuvable' });
    const body = await readJsonBody(req);
    const data = {};
    if (body.name !== undefined) {
      const name = text(body.name, 160);
      if (!name) return sendJson(res, 400, { error: 'Nom du modèle invalide' });
      data.name = name;
    }
    if (body.category !== undefined) {
      const category = text(body.category, 60);
      if (!category) return sendJson(res, 400, { error: 'Catégorie invalide' });
      data.category = category;
    }
    if (body.description !== undefined) {
      const description = optionalText(body.description, 2_000);
      if (description === undefined) return sendJson(res, 400, { error: 'Description invalide' });
      data.description = description;
    }
    if (body.bodyMarkdown !== undefined) {
      const bodyMarkdown = optionalText(body.bodyMarkdown, MAX_BODY);
      if (bodyMarkdown === undefined) return sendJson(res, 400, { error: 'Contenu invalide' });
      data.bodyMarkdown = bodyMarkdown || '';
    }
    if (body.projectKind !== undefined) {
      const projectKind = body.projectKind ? enums.kind(body.projectKind, null) : null;
      if (body.projectKind && !projectKind) return sendJson(res, 400, { error: 'Type de projet inconnu' });
      data.projectKind = projectKind;
    }
    const name = data.name ?? template.name;
    const category = data.category ?? template.category;
    if (data.name || data.category) {
      const clash = await prisma.documentTemplate.findFirst({
        where: { name, category, NOT: { id } },
        select: { id: true },
      });
      if (clash) return sendJson(res, 409, { error: 'Un modèle porte déjà ce nom dans cette catégorie' });
    }
    const updated = await prisma.documentTemplate.update({ where: { id }, data });
    return sendJson(res, 200, { template: updated });
  } catch (error) {
    console.error('[emonos:templates:patch]', error);
    return sendJson(res, 500, { error: 'Erreur serveur' });
  }
}

/** DELETE /api/emonos/templates/:id — les documents déjà instanciés sont conservés. */
export async function deleteTemplate(req, res) {
  setCors(res);
  try {
    const auth = await requireUser(req);
    if (auth.error) return sendJson(res, auth.status, { error: auth.error });
    const id = String(req.params?.id || '');
    const template = await prisma.documentTemplate.findUnique({ where: { id }, select: { id: true } });
    if (!template) return sendJson(res, 404, { error: 'Modèle introuvable' });
    await prisma.documentTemplate.delete({ where: { id } });
    return sendJson(res, 200, { deleted: true });
  } catch (error) {
    console.error('[emonos:templates:delete]', error);
    return sendJson(res, 500, { error: 'Erreur serveur' });
  }
}

/** GET /api/emonos/documents?projectId= */
export async function listProjectDocuments(req, res) {
  setCors(res);
  try {
    const q = query(req);
    const access = await requireProject(req, q.projectId);
    if (access.error) return sendJson(res, access.status, { error: access.error });
    const documents = await prisma.projectDocument.findMany({
      where: { projectId: access.project.id },
      orderBy: { createdAt: 'asc' },
      include: { template: { select: { id: true, name: true, category: true } } },
    });
    return sendJson(res, 200, { documents });
  } catch (error) {
    console.error('[emonos:documents:list]', error);
    return sendJson(res, 500, { error: 'Erreur serveur' });
  }
}

/** POST /api/emonos/documents — instancie un modèle sur un projet, ou crée un document vierge. */
export async function createProjectDocument(req, res) {
  setCors(res);
  try {
    const body = await readJsonBody(req);
    const access = await requireProject(req, body.projectId, { write: true });
    if (access.error) return sendJson(res, access.status, { error: access.error });

    let template = null;
    if (body.templateId) {
      template = await prisma.documentTemplate.findUnique({ where: { id: String(body.templateId) } });
      if (!template) return sendJson(res, 400, { error: 'Modèle introuvable' });
    }
    const title = text(body.title, 200) || template?.name;
    if (!title) return sendJson(res, 400, { error: 'Titre du document requis' });
    const bodyMarkdown = optionalText(body.bodyMarkdown, MAX_BODY);
    if (bodyMarkdown === undefined) return sendJson(res, 400, { error: 'Contenu invalide' });

    const document = await prisma.projectDocument.create({
      data: {
        projectId: access.project.id,
        templateId: template?.id ?? null,
        title,
        bodyMarkdown: bodyMarkdown ?? template?.bodyMarkdown ?? '',
      },
    });
    return sendJson(res, 201, { document });
  } catch (error) {
    console.error('[emonos:documents:create]', error);
    return sendJson(res, 500, { error: 'Erreur serveur' });
  }
}

/** GET /api/emonos/documents/:id */
export async function getProjectDocument(req, res) {
  setCors(res);
  try {
    const document = await prisma.projectDocument.findUnique({ where: { id: String(req.params?.id || '') } });
    if (!document) return sendJson(res, 404, { error: 'Document introuvable' });
    const access = await requireProject(req, document.projectId);
    if (access.error) return sendJson(res, access.status, { error: access.error });
    return sendJson(res, 200, { document });
  } catch (error) {
    console.error('[emonos:documents:get]', error);
    return sendJson(res, 500, { error: 'Erreur serveur' });
  }
}

/** PATCH /api/emonos/documents/:id */
export async function patchProjectDocument(req, res) {
  setCors(res);
  try {
    const document = await prisma.projectDocument.findUnique({ where: { id: String(req.params?.id || '') } });
    if (!document) return sendJson(res, 404, { error: 'Document introuvable' });
    const access = await requireProject(req, document.projectId, { write: true });
    if (access.error) return sendJson(res, access.status, { error: access.error });
    const body = await readJsonBody(req);
    const data = {};
    if (body.title !== undefined) {
      const title = text(body.title, 200);
      if (!title) return sendJson(res, 400, { error: 'Titre invalide' });
      data.title = title;
    }
    if (body.bodyMarkdown !== undefined) {
      const bodyMarkdown = optionalText(body.bodyMarkdown, MAX_BODY);
      if (bodyMarkdown === undefined) return sendJson(res, 400, { error: 'Contenu invalide' });
      data.bodyMarkdown = bodyMarkdown || '';
    }
    const updated = await prisma.projectDocument.update({ where: { id: document.id }, data });
    return sendJson(res, 200, { document: updated });
  } catch (error) {
    console.error('[emonos:documents:patch]', error);
    return sendJson(res, 500, { error: 'Erreur serveur' });
  }
}

/** DELETE /api/emonos/documents/:id */
export async function deleteProjectDocument(req, res) {
  setCors(res);
  try {
    const document = await prisma.projectDocument.findUnique({ where: { id: String(req.params?.id || '') } });
    if (!document) return sendJson(res, 404, { error: 'Document introuvable' });
    const access = await requireProject(req, document.projectId, { write: true });
    if (access.error) return sendJson(res, access.status, { error: access.error });
    await prisma.projectDocument.delete({ where: { id: document.id } });
    return sendJson(res, 200, { deleted: true });
  } catch (error) {
    console.error('[emonos:documents:delete]', error);
    return sendJson(res, 500, { error: 'Erreur serveur' });
  }
}
