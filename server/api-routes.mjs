/**
 * Routes HTTP /api/* partagées par :
 * - `server/dev.mjs` (Express + Vite middleware)
 * - `vite.config.js` (plugin configureServer quand on lance `vite` seul)
 */
import register from '../api/register.js';
import login from '../api/login.js';
import me from '../api/me.js';
import profile from '../api/profile.js';
import enroll from '../api/enroll.js';
import progress from '../api/progress.js';
import posts from '../api/posts.js';
import lessons from '../api/lessons.js';
import { createLesson, patchLesson, deleteLesson } from '../api/admin-lessons.js';
import { overview, listUsers, patchUser } from '../api/admin-users.js';
import { listWebinars, getNextWebinar, getWebinarById } from '../api/webinars-public.js';
import { registerToWebinar } from '../api/webinars-register.js';
import {
  adminListWebinars,
  adminGetWebinar,
  adminCreateWebinar,
  adminPatchWebinar,
  adminDeleteWebinar,
  adminWebinarRegistrations,
} from '../api/admin-webinars.js';
import { adminListMarketingContacts } from '../api/admin-crm.js';

/** @param {import('express').Express} app */
export function registerApiRoutes(app) {
  /**
   * Avec Vite en middleware, req.url peut ne plus correspondre au chemin réel ;
   * sans cela, certaines routes paramétrées (ex. GET /api/admin/webinars/:id) ne matchent pas
   * et la requête tombe sur le HTML du SPA → « Introuvable » côté client.
   */
  app.use((req, res, next) => {
    const raw = req.originalUrl || req.url;
    if (typeof raw === 'string' && raw.startsWith('/api')) {
      req.url = raw.split('?')[0];
    }
    next();
  });

  app.post('/api/register', (req, res) => register(req, res));
  app.post('/api/login', (req, res) => login(req, res));
  app.get('/api/me', (req, res) => me(req, res));
  app.patch('/api/profile', (req, res) => profile(req, res));
  app.post('/api/enroll', (req, res) => enroll(req, res));
  app.get('/api/progress', (req, res) => progress(req, res));
  app.post('/api/progress', (req, res) => progress(req, res));
  app.get('/api/posts', (req, res) => posts(req, res));
  app.post('/api/posts', (req, res) => posts(req, res));
  app.get('/api/lessons', (req, res) => lessons(req, res));
  app.post('/api/admin/lessons', (req, res) => createLesson(req, res));
  app.patch('/api/admin/lessons/:lessonId', (req, res) => patchLesson(req, res));
  app.delete('/api/admin/lessons/:lessonId', (req, res) => deleteLesson(req, res));
  app.get('/api/admin/overview', (req, res) => overview(req, res));
  app.get('/api/admin/users', (req, res) => listUsers(req, res));
  app.patch('/api/admin/users/:userId', (req, res) => patchUser(req, res));
  app.get('/api/admin/crm/contacts', (req, res) => adminListMarketingContacts(req, res));

  app.get('/api/webinars/next', (req, res) => getNextWebinar(req, res));
  app.get('/api/webinars', (req, res) => listWebinars(req, res));

  /** Avant /api/webinars/:id — chemins plus longs d’abord (admin). */
  app.get('/api/admin/webinars', (req, res) => adminListWebinars(req, res));
  app.post('/api/admin/webinars', (req, res) => adminCreateWebinar(req, res));
  app.get('/api/admin/webinars/:id/registrations', (req, res) => adminWebinarRegistrations(req, res));
  app.get('/api/admin/webinars/:id', (req, res) => adminGetWebinar(req, res));
  app.patch('/api/admin/webinars/:id', (req, res) => adminPatchWebinar(req, res));
  app.delete('/api/admin/webinars/:id', (req, res) => adminDeleteWebinar(req, res));

  app.get('/api/webinars/:id', (req, res) => getWebinarById(req, res));
  app.post('/api/webinars/:id/register', (req, res) => registerToWebinar(req, res));
}
