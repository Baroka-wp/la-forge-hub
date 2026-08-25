/**
 * EMONOS — état partagé de l'espace de travail et navigation interne.
 * L'application vit sous `/emonos` : le rail de gauche change de section,
 * la barre d'outils choisit le projet courant (« Project ▾ All » du deck).
 */

const PROJECT_KEY = 'emonos_project_v1';

export const SECTIONS = [
  { key: 'projects', label: 'Gestion de projet', path: '/emonos', icon: '▤' },
  { key: 'timeline', label: 'Timeline', path: '/emonos/timeline', icon: '▭' },
  { key: 'tasks', label: 'Gestion des tâches', path: '/emonos/tasks', icon: '☰' },
  { key: 'documents', label: 'Modèles de documents', path: '/emonos/documents', icon: '❐' },
  { key: 'teams', label: 'Gestion des équipes', path: '/emonos/teams', icon: '⚇' },
  { key: 'workflows', label: 'Workflows', path: '/emonos/workflows', icon: '⤳' },
  { key: 'config', label: 'Configuration', path: '/emonos/config', icon: '⚙' },
];

export const state = {
  ready: false,
  user: null,
  blueprints: [],
  teams: [],
  projects: [],
  templates: [],
  workflows: [],
  section: 'projects',
  /** Projet courant, ou `null` pour « Tous les projets ». */
  projectId: null,
  workflowId: null,
  /** Tâche ouverte : le bouton OPEN du deck descend d'un niveau. */
  parentTaskId: null,
  filters: {
    groupBy: 'priority',
    scope: 'all',
    archived: false,
    critical: false,
    stopped: false,
    before: '',
    page: 1,
  },
  view: {},
};

export function readStoredProject() {
  try {
    return localStorage.getItem(PROJECT_KEY) || null;
  } catch {
    return null;
  }
}

export function storeProject(projectId) {
  try {
    if (projectId) localStorage.setItem(PROJECT_KEY, projectId);
    else localStorage.removeItem(PROJECT_KEY);
  } catch {
    /* stockage indisponible : la sélection ne survivra pas au rechargement */
  }
}

export function currentProject() {
  return state.projects.find((p) => p.id === state.projectId) || null;
}

/** Remet les filtres de tâches à zéro quand on change de projet ou de section. */
export function resetTaskFilters() {
  state.filters.archived = false;
  state.filters.critical = false;
  state.filters.stopped = false;
  state.filters.before = '';
  state.filters.page = 1;
  state.parentTaskId = null;
}

/** Arborescence des projets pour le rail et le sélecteur de projet parent. */
export function projectTree(projects) {
  const byParent = new Map();
  projects.forEach((project) => {
    const key = project.parentId || 'root';
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(project);
  });
  const walk = (parentKey, depth) =>
    (byParent.get(parentKey) || []).flatMap((project) => [
      { project, depth },
      ...walk(project.id, depth + 1),
    ]);
  return walk('root', 0);
}
