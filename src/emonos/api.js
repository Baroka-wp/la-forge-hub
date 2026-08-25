/**
 * EMONOS — client HTTP. Reprend le stockage du jeton de `src/api.js`
 * (même session que le reste de La Forge Hub) et le loader global.
 */
import { pushLoading, popLoading } from '../loader.js';

const JWT_KEY = 'lms_jwt';

function apiBase() {
  return import.meta.env.VITE_API_BASE_URL || '';
}

export function hasSession() {
  try {
    return Boolean(localStorage.getItem(JWT_KEY));
  } catch {
    return false;
  }
}

/**
 * @param {string} method
 * @param {string} path
 * @param {unknown} [payload]
 * @param {{ silent?: boolean }} [opts]
 * @returns {Promise<{ ok: boolean, status: number, body: any, error: string | null }>}
 */
async function call(method, path, payload, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  let token = null;
  try {
    token = localStorage.getItem(JWT_KEY);
  } catch {
    token = null;
  }
  if (token) headers.Authorization = `Bearer ${token}`;
  if (!opts.silent) pushLoading();
  try {
    const response = await fetch(`${apiBase()}${path}`, {
      method,
      headers,
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    });
    const body = await response.json().catch(() => ({}));
    return {
      ok: response.ok,
      status: response.status,
      body,
      error: response.ok ? null : body?.error || 'Erreur inattendue',
    };
  } catch {
    return { ok: false, status: 0, body: {}, error: 'Connexion impossible' };
  } finally {
    if (!opts.silent) popLoading();
  }
}

const get = (path, opts) => call('GET', path, undefined, opts);
const post = (path, payload, opts) => call('POST', path, payload, opts);
const patch = (path, payload, opts) => call('PATCH', path, payload, opts);
const put = (path, payload, opts) => call('PUT', path, payload, opts);
const del = (path, opts) => call('DELETE', path, undefined, opts);

function qs(params) {
  const search = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    search.set(key, String(value));
  });
  const str = search.toString();
  return str ? `?${str}` : '';
}

export const emonos = {
  bootstrap: () => get('/api/emonos/bootstrap'),
  directory: (term) => get(`/api/emonos/directory${qs({ q: term })}`, { silent: true }),
  myTasks: () => get('/api/emonos/my-tasks'),

  listProjects: (params) => get(`/api/emonos/projects${qs(params)}`),
  getProject: (id) => get(`/api/emonos/projects/${id}`),
  createProject: (payload) => post('/api/emonos/projects', payload),
  patchProject: (id, payload) => patch(`/api/emonos/projects/${id}`, payload),
  deleteProject: (id) => del(`/api/emonos/projects/${id}`),
  timeline: (id) => get(`/api/emonos/projects/${id}/timeline`),
  addProjectMember: (id, payload) => post(`/api/emonos/projects/${id}/members`, payload),
  removeProjectMember: (id, userId) => del(`/api/emonos/projects/${id}/members/${userId}`),

  listTasks: (params) => get(`/api/emonos/tasks${qs(params)}`),
  getTask: (id) => get(`/api/emonos/tasks/${id}`),
  createTask: (payload) => post('/api/emonos/tasks', payload),
  patchTask: (id, payload) => patch(`/api/emonos/tasks/${id}`, payload),
  deleteTask: (id) => del(`/api/emonos/tasks/${id}`),
  taskAction: (id, action) => post(`/api/emonos/tasks/${id}/actions/${action}`, {}),

  listWorkflows: () => get('/api/emonos/workflows'),
  getWorkflow: (id) => get(`/api/emonos/workflows/${id}`),
  createWorkflow: (payload) => post('/api/emonos/workflows', payload),
  saveWorkflow: (id, payload) => put(`/api/emonos/workflows/${id}`, payload),

  listRuns: (projectId) => get(`/api/emonos/runs${qs({ projectId })}`),
  startRun: (projectId, payload) => post(`/api/emonos/projects/${projectId}/workflow`, payload || {}),
  advanceRun: (runId, payload) => post(`/api/emonos/runs/${runId}/advance`, payload || {}),
  cancelRun: (runId) => post(`/api/emonos/runs/${runId}/cancel`, {}),

  listTeams: () => get('/api/emonos/teams'),
  createTeam: (payload) => post('/api/emonos/teams', payload),
  patchTeam: (id, payload) => patch(`/api/emonos/teams/${id}`, payload),
  deleteTeam: (id) => del(`/api/emonos/teams/${id}`),
  addTeamMember: (id, payload) => post(`/api/emonos/teams/${id}/members`, payload),
  removeTeamMember: (id, userId) => del(`/api/emonos/teams/${id}/members/${userId}`),

  listTemplates: (params) => get(`/api/emonos/templates${qs(params)}`),
  createTemplate: (payload) => post('/api/emonos/templates', payload),
  patchTemplate: (id, payload) => patch(`/api/emonos/templates/${id}`, payload),
  deleteTemplate: (id) => del(`/api/emonos/templates/${id}`),

  listDocuments: (projectId) => get(`/api/emonos/documents${qs({ projectId })}`),
  createDocument: (payload) => post('/api/emonos/documents', payload),
  getDocument: (id) => get(`/api/emonos/documents/${id}`),
  patchDocument: (id, payload) => patch(`/api/emonos/documents/${id}`, payload),
  deleteDocument: (id) => del(`/api/emonos/documents/${id}`),
};
