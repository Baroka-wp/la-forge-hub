/**
 * Routes HTTP /api/* partagées par :
 * - `server/dev.mjs` (Express + Vite middleware)
 * - `vite.config.js` (plugin configureServer quand on lance `vite` seul)
 */
import register from '../api/register.js';
import login from '../api/login.js';
import forgotPassword from '../api/forgot-password.js';
import resetPassword from '../api/reset-password.js';
import me from '../api/me.js';
import profile from '../api/profile.js';
import enroll from '../api/enroll.js';
import progress from '../api/progress.js';
import posts from '../api/posts.js';
import lessons from '../api/lessons.js';
import getLessonContent from '../api/lesson-content.js';
import { listTracks, getTrack } from '../api/tracks.js';
import { submitQuiz, submitExercise, listAttempts } from '../api/evaluations.js';
import { submitProject } from '../api/projects.js';
import { getMyProgress } from '../api/me-progress.js';
import {
  adminListTracks, adminCreateTrack, adminPatchTrack,
  adminCreateModule, adminPatchModule, adminCreateExercise, adminCreateQuizQuestion,
  adminListSubmissions, adminPatchSubmission,
} from '../api/admin-lms.js';
import { createLesson, patchLesson, deleteLesson } from '../api/admin-lessons.js';
import { overview, listUsers, getUserDetail, patchUser } from '../api/admin-users.js';
import { listWebinars, getNextWebinar, getWebinarById } from '../api/webinars-public.js';
import { registerToWebinar } from '../api/webinars-register.js';
import { replayOptin } from '../api/webinars-replay-optin.js';
import { newsletterOptin } from '../api/newsletter-optin.js';
import { trackReplayView } from '../api/webinars-replay-view.js';
import {
  adminListWebinars,
  adminGetWebinar,
  adminCreateWebinar,
  adminPatchWebinar,
  adminDeleteWebinar,
  adminWebinarRegistrations,
} from '../api/admin-webinars.js';
import { lookupCertificates, getCertificateFile } from '../api/attestations.js';
import adminAttestationsImport from '../api/admin-attestations-import.js';
import attestationsSupport from '../api/attestations-support.js';
import adminAttestations from '../api/admin-attestations.js';
import {
  adminListMarketingContacts,
  adminCreateMarketingContact,
  adminCrmSendEmail,
} from '../api/admin-crm.js';

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
  app.post('/api/forgot-password', (req, res) => forgotPassword(req, res));
  app.post('/api/reset-password', (req, res) => resetPassword(req, res));
  app.get('/api/me', (req, res) => me(req, res));
  app.patch('/api/profile', (req, res) => profile(req, res));
  app.post('/api/enroll', (req, res) => enroll(req, res));
  app.get('/api/progress', (req, res) => progress(req, res));
  app.post('/api/progress', (req, res) => progress(req, res));
  app.get('/api/posts', (req, res) => posts(req, res));
  app.post('/api/posts', (req, res) => posts(req, res));
  app.get('/api/lessons', (req, res) => lessons(req, res));
  app.get('/api/lessons/:lessonId', (req, res) => getLessonContent(req, res));
  app.get('/api/tracks', (req, res) => listTracks(req, res));
  app.get('/api/tracks/:slug', (req, res) => getTrack(req, res));
  app.post('/api/quiz/:lessonId/submit', (req, res) => submitQuiz(req, res));
  app.post('/api/exercises/:exerciseId/submit', (req, res) => submitExercise(req, res));
  app.get('/api/attempts', (req, res) => listAttempts(req, res));
  app.post('/api/projects/:projectId/submit', (req, res) => submitProject(req, res));
  app.get('/api/me/progress', (req, res) => getMyProgress(req, res));
  app.get('/api/admin/tracks', (req, res) => adminListTracks(req, res));
  app.post('/api/admin/tracks', (req, res) => adminCreateTrack(req, res));
  app.patch('/api/admin/tracks/:id', (req, res) => adminPatchTrack(req, res));
  app.post('/api/admin/modules', (req, res) => adminCreateModule(req, res));
  app.patch('/api/admin/modules/:id', (req, res) => adminPatchModule(req, res));
  app.post('/api/admin/exercises', (req, res) => adminCreateExercise(req, res));
  app.post('/api/admin/quiz-questions', (req, res) => adminCreateQuizQuestion(req, res));
  app.get('/api/admin/submissions', (req, res) => adminListSubmissions(req, res));
  app.patch('/api/admin/submissions/:id', (req, res) => adminPatchSubmission(req, res));
  app.post('/api/admin/lessons', (req, res) => createLesson(req, res));
  app.patch('/api/admin/lessons/:lessonId', (req, res) => patchLesson(req, res));
  app.delete('/api/admin/lessons/:lessonId', (req, res) => deleteLesson(req, res));
  app.get('/api/admin/overview', (req, res) => overview(req, res));
  app.get('/api/admin/users', (req, res) => listUsers(req, res));
  app.get('/api/admin/users/:userId', (req, res) => getUserDetail(req, res));
  app.patch('/api/admin/users/:userId', (req, res) => patchUser(req, res));
  app.get('/api/admin/crm/contacts', (req, res) => adminListMarketingContacts(req, res));
  app.post('/api/admin/crm/contacts', (req, res) => adminCreateMarketingContact(req, res));
  app.post('/api/admin/crm/send-email', (req, res) => adminCrmSendEmail(req, res));

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
  app.post('/api/webinars/:id/replay-view', (req, res) => trackReplayView(req, res));
  app.post('/api/webinars/replay-optin', (req, res) => replayOptin(req, res));
  app.post('/api/newsletter/optin', (req, res) => newsletterOptin(req, res));

  /** Attestations NOAI / Bootcamp IOAI (page publique non listée /attestations). */
  app.post('/api/attestations/lookup', (req, res) => lookupCertificates(req, res));
  app.get('/api/attestations/file', (req, res) => getCertificateFile(req, res));
  app.post('/api/attestations/support', (req, res) => attestationsSupport(req, res));
  app.post('/api/admin/attestations/import', (req, res) => adminAttestationsImport(req, res));
  app.get('/api/admin/attestations', (req, res) => adminAttestations(req, res));
}
