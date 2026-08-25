/**
 * EMONOS — modèles de projet (« Type of project » de l'assistant de création).
 *
 * Chaque modèle décrit, pour un `TaskProjectKind` :
 *  - l'arborescence de tâches créée automatiquement,
 *  - le workflow installé pour ce type de projet,
 *  - les modèles de documents associés.
 *
 * Les identifiants de macro (`eventDashboard` / `eventConfigure`) suivent le deck :
 * une tâche n'affiche le bouton DASHBOARD ou CONFIGURE que si la propriété
 * correspondante porte une macro.
 */

export const PROJECT_KINDS = ['SOFTWARE_DEV', 'CALL_FOR_TENDER', 'COMPANY_MGMT'];
export const PROJECT_STAGES = ['PRESALE', 'EVALUATION', 'DEVELOPMENT', 'DELIVERY', 'CLOSED'];
export const TASK_STATES = ['TODO', 'RUNNING', 'STOPPED', 'DONE', 'CANCELLED'];
export const TASK_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'];
export const DATE_MODES = ['NONE', 'FIXED', 'AUTOMATIC'];
export const MEMBER_ROLES = ['OWNER', 'MANAGER', 'MEMBER', 'VIEWER'];
export const NODE_KINDS = ['START', 'STEP', 'DECISION', 'SUBTASK', 'END'];

/** Macros disponibles côté serveur pour les boutons custom d'une tâche. */
export const TASK_MACROS = {
  event_dashboard: ['sprint_dashboard', 'budget_dashboard', 'tender_dashboard'],
  event_configure: ['configure_repository', 'configure_ci', 'configure_review_board'],
};

/**
 * Décalages en jours depuis le début du projet, utilisés quand le projet est daté
 * (`FIXED` avec une date de début, ou `AUTOMATIC`).
 */
const softwareDev = {
  kind: 'SOFTWARE_DEV',
  label: 'Développement logiciel',
  headline: 'Vous créez un logiciel pour un client et planifiez toutes les tâches associées.',
  description:
    "Toutes les tâches nécessaires au pilotage du développement d'un logiciel et de sa partie administrative.",
  defaultStage: 'PRESALE',
  durationDays: 120,
  tasks: [
    {
      key: 'presale',
      title: 'Avant-vente',
      priority: 'HIGH',
      offsetDays: 0,
      durationDays: 15,
      children: [
        { key: 'qualification', title: 'Qualification du besoin', offsetDays: 0, durationDays: 4 },
        { key: 'estimate', title: 'Chiffrage', priority: 'HIGH', offsetDays: 4, durationDays: 5 },
        { key: 'proposal', title: 'Proposition commerciale', offsetDays: 9, durationDays: 6 },
      ],
    },
    {
      key: 'development',
      title: 'Développement',
      priority: 'CRITICAL',
      offsetDays: 15,
      durationDays: 75,
      eventDashboard: 'sprint_dashboard',
      children: [
        {
          key: 'design',
          title: 'Design',
          priority: 'HIGH',
          offsetDays: 15,
          durationDays: 20,
          children: [
            { key: 'ux', title: 'Parcours utilisateur', offsetDays: 15, durationDays: 8 },
            { key: 'ui', title: 'Maquettes UI', offsetDays: 23, durationDays: 12 },
          ],
        },
        {
          key: 'build',
          title: 'Réalisation',
          priority: 'CRITICAL',
          offsetDays: 35,
          durationDays: 40,
          eventConfigure: 'configure_repository',
          children: [
            { key: 'backend', title: 'Backend', offsetDays: 35, durationDays: 30 },
            { key: 'frontend', title: 'Frontend', offsetDays: 40, durationDays: 30 },
          ],
        },
        {
          key: 'qa',
          title: 'Recette',
          priority: 'HIGH',
          offsetDays: 75,
          durationDays: 15,
          eventConfigure: 'configure_ci',
        },
      ],
    },
    {
      key: 'delivery',
      title: 'Livraison',
      priority: 'HIGH',
      offsetDays: 90,
      durationDays: 30,
      children: [
        { key: 'deployment', title: 'Mise en production', offsetDays: 90, durationDays: 10 },
        { key: 'training', title: 'Formation client', offsetDays: 100, durationDays: 8 },
        { key: 'handover', title: 'Transfert & documentation', offsetDays: 108, durationDays: 12 },
      ],
    },
    {
      key: 'admin',
      title: 'Administratif',
      priority: 'NORMAL',
      offsetDays: 0,
      durationDays: 120,
      eventDashboard: 'budget_dashboard',
      children: [
        { key: 'contract', title: 'Contrat & bons de commande', offsetDays: 0, durationDays: 20 },
        { key: 'invoicing', title: 'Facturation', offsetDays: 30, durationDays: 90 },
      ],
    },
  ],
  workflow: {
    name: 'Projet logiciel',
    description: "Workflow du deck EMONOS : avant-vente, évaluation, décision GO / NO GO, développement, livraison.",
    nodes: [
      { key: 'start', kind: 'START', label: 'Début', x: 40, y: 180 },
      { key: 'presale', kind: 'SUBTASK', label: 'Avant-vente', x: 200, y: 180, macro: { taskKey: 'presale', title: 'Avant-vente', priority: 'HIGH' } },
      { key: 'evaluation', kind: 'STEP', label: 'Évaluation', x: 380, y: 180 },
      { key: 'decision', kind: 'DECISION', label: 'GO / NO GO ?', x: 560, y: 180 },
      { key: 'development', kind: 'SUBTASK', label: 'Développement', x: 760, y: 100, macro: { taskKey: 'development', title: 'Développement', priority: 'CRITICAL' } },
      { key: 'delivery', kind: 'SUBTASK', label: 'Livraison', x: 940, y: 100, macro: { taskKey: 'delivery', title: 'Livraison', priority: 'HIGH' } },
      { key: 'closed', kind: 'END', label: 'Clôturé', x: 1120, y: 100 },
      { key: 'abandoned', kind: 'END', label: 'Abandonné', x: 760, y: 300 },
    ],
    transitions: [
      { from: 'start', to: 'presale', label: '' },
      { from: 'presale', to: 'evaluation', label: '' },
      { from: 'evaluation', to: 'decision', label: '' },
      { from: 'decision', to: 'development', label: 'GO' },
      { from: 'decision', to: 'abandoned', label: 'NO GO' },
      { from: 'development', to: 'delivery', label: '' },
      { from: 'delivery', to: 'closed', label: '' },
    ],
    /** Étape du projet appliquée à l'arrivée sur le nœud. */
    stageByNode: {
      presale: 'PRESALE',
      evaluation: 'EVALUATION',
      development: 'DEVELOPMENT',
      delivery: 'DELIVERY',
      closed: 'CLOSED',
      abandoned: 'CLOSED',
    },
  },
  documents: [
    { name: 'Proposition commerciale', category: 'avant-vente', body: '# Proposition commerciale\n\n## Contexte\n\n## Périmètre\n\n## Charge estimée\n\n## Prix\n' },
    { name: 'Spécification fonctionnelle', category: 'conception', body: '# Spécification fonctionnelle\n\n## Objectif\n\n## Cas d’usage\n\n## Règles de gestion\n' },
    { name: 'Procès-verbal de recette', category: 'livraison', body: '# Procès-verbal de recette\n\n## Périmètre testé\n\n## Anomalies\n\n## Décision\n' },
  ],
};

const callForTender = {
  kind: 'CALL_FOR_TENDER',
  label: 'Appel d’offres',
  headline: 'Vous devez préparer tous les documents d’un marché public.',
  description: "Constitution, contrôle et dépôt d'un dossier de réponse à un appel d'offres.",
  defaultStage: 'PRESALE',
  durationDays: 45,
  tasks: [
    {
      key: 'analysis',
      title: 'Analyse du dossier',
      priority: 'HIGH',
      offsetDays: 0,
      durationDays: 7,
      eventDashboard: 'tender_dashboard',
      children: [
        { key: 'read-dce', title: 'Lecture du DCE', offsetDays: 0, durationDays: 3 },
        { key: 'go-nogo', title: 'Décision GO / NO GO', priority: 'CRITICAL', offsetDays: 3, durationDays: 4 },
      ],
    },
    {
      key: 'administrative',
      title: 'Dossier administratif',
      priority: 'HIGH',
      offsetDays: 7,
      durationDays: 20,
      children: [
        { key: 'dc1', title: 'Formulaire DC1', offsetDays: 7, durationDays: 5 },
        { key: 'dc2', title: 'Formulaire DC2', offsetDays: 7, durationDays: 5 },
        { key: 'attestations', title: 'Attestations fiscales et sociales', offsetDays: 12, durationDays: 15 },
      ],
    },
    {
      key: 'technical',
      title: 'Mémoire technique',
      priority: 'CRITICAL',
      offsetDays: 7,
      durationDays: 28,
      children: [
        { key: 'methodology', title: 'Méthodologie', offsetDays: 7, durationDays: 14 },
        { key: 'references', title: 'Références et CV', offsetDays: 14, durationDays: 12 },
      ],
    },
    {
      key: 'pricing',
      title: 'Offre financière',
      priority: 'CRITICAL',
      offsetDays: 21,
      durationDays: 14,
      children: [{ key: 'bpu', title: 'Bordereau de prix', offsetDays: 21, durationDays: 14 }],
    },
    { key: 'submission', title: 'Dépôt de l’offre', priority: 'CRITICAL', offsetDays: 40, durationDays: 5 },
  ],
  workflow: {
    name: 'Appel d’offres',
    description: "Cycle de réponse à un marché public, du retrait du DCE à la notification.",
    nodes: [
      { key: 'start', kind: 'START', label: 'Début', x: 40, y: 180 },
      { key: 'analysis', kind: 'SUBTASK', label: 'Analyse du DCE', x: 200, y: 180, macro: { taskKey: 'analysis', title: 'Analyse du dossier', priority: 'HIGH' } },
      { key: 'decision', kind: 'DECISION', label: 'Répondre ?', x: 400, y: 180 },
      { key: 'assembly', kind: 'SUBTASK', label: 'Constitution du dossier', x: 620, y: 100, macro: { taskKey: 'technical', title: 'Mémoire technique', priority: 'CRITICAL' } },
      { key: 'submission', kind: 'STEP', label: 'Dépôt', x: 840, y: 100 },
      { key: 'result', kind: 'DECISION', label: 'Résultat', x: 1020, y: 100 },
      { key: 'won', kind: 'END', label: 'Marché gagné', x: 1220, y: 40 },
      { key: 'lost', kind: 'END', label: 'Marché perdu', x: 1220, y: 170 },
      { key: 'declined', kind: 'END', label: 'Sans suite', x: 400, y: 320 },
    ],
    transitions: [
      { from: 'start', to: 'analysis', label: '' },
      { from: 'analysis', to: 'decision', label: '' },
      { from: 'decision', to: 'assembly', label: 'GO' },
      { from: 'decision', to: 'declined', label: 'NO GO' },
      { from: 'assembly', to: 'submission', label: '' },
      { from: 'submission', to: 'result', label: '' },
      { from: 'result', to: 'won', label: 'Retenu' },
      { from: 'result', to: 'lost', label: 'Non retenu' },
    ],
    stageByNode: {
      analysis: 'PRESALE',
      assembly: 'EVALUATION',
      submission: 'DELIVERY',
      won: 'CLOSED',
      lost: 'CLOSED',
      declined: 'CLOSED',
    },
  },
  documents: [
    { name: 'Mémoire technique', category: 'appel-offres', body: '# Mémoire technique\n\n## Compréhension du besoin\n\n## Méthodologie\n\n## Moyens humains\n\n## Planning\n' },
    { name: 'Lettre de candidature', category: 'appel-offres', body: '# Lettre de candidature\n\nObjet : réponse à l’appel d’offres n° …\n' },
  ],
};

const companyManagement = {
  kind: 'COMPANY_MGMT',
  label: 'Gestion d’entreprise',
  headline: 'Toutes les tâches nécessaires au pilotage d’une entreprise.',
  description: 'Rituels et obligations récurrentes : administratif, finance, RH, commercial.',
  defaultStage: 'DEVELOPMENT',
  durationDays: 365,
  tasks: [
    {
      key: 'finance',
      title: 'Finance',
      priority: 'HIGH',
      offsetDays: 0,
      durationDays: 365,
      eventDashboard: 'budget_dashboard',
      children: [
        { key: 'budget', title: 'Budget annuel', priority: 'HIGH', offsetDays: 0, durationDays: 30 },
        { key: 'monthly-close', title: 'Clôture mensuelle', offsetDays: 30, durationDays: 335 },
      ],
    },
    {
      key: 'hr',
      title: 'Ressources humaines',
      offsetDays: 0,
      durationDays: 365,
      children: [
        { key: 'payroll', title: 'Paie', offsetDays: 0, durationDays: 365 },
        { key: 'reviews', title: 'Entretiens annuels', offsetDays: 300, durationDays: 45 },
      ],
    },
    {
      key: 'sales',
      title: 'Commercial',
      priority: 'HIGH',
      offsetDays: 0,
      durationDays: 365,
      children: [
        { key: 'pipeline', title: 'Suivi du pipeline', offsetDays: 0, durationDays: 365 },
        { key: 'reporting', title: 'Reporting trimestriel', offsetDays: 80, durationDays: 285 },
      ],
    },
    {
      key: 'legal',
      title: 'Juridique & conformité',
      offsetDays: 0,
      durationDays: 365,
      eventConfigure: 'configure_review_board',
      children: [{ key: 'contracts', title: 'Revue des contrats', offsetDays: 0, durationDays: 365 }],
    },
  ],
  workflow: {
    name: 'Pilotage d’entreprise',
    description: 'Boucle de pilotage trimestrielle : planification, exécution, revue.',
    nodes: [
      { key: 'start', kind: 'START', label: 'Début', x: 40, y: 180 },
      { key: 'planning', kind: 'STEP', label: 'Planification', x: 220, y: 180 },
      { key: 'execution', kind: 'SUBTASK', label: 'Exécution', x: 420, y: 180, macro: { taskKey: 'sales', title: 'Commercial', priority: 'HIGH' } },
      { key: 'review', kind: 'DECISION', label: 'Objectifs atteints ?', x: 640, y: 180 },
      { key: 'adjust', kind: 'STEP', label: 'Plan de redressement', x: 640, y: 340 },
      { key: 'closing', kind: 'END', label: 'Exercice clos', x: 900, y: 180 },
    ],
    transitions: [
      { from: 'start', to: 'planning', label: '' },
      { from: 'planning', to: 'execution', label: '' },
      { from: 'execution', to: 'review', label: '' },
      { from: 'review', to: 'closing', label: 'Oui' },
      { from: 'review', to: 'adjust', label: 'Non' },
      { from: 'adjust', to: 'execution', label: '' },
    ],
    stageByNode: {
      planning: 'PRESALE',
      execution: 'DEVELOPMENT',
      adjust: 'DEVELOPMENT',
      closing: 'CLOSED',
    },
  },
  documents: [
    { name: 'Compte rendu de comité', category: 'pilotage', body: '# Compte rendu de comité\n\n## Participants\n\n## Décisions\n\n## Actions\n' },
    { name: 'Budget annuel', category: 'finance', body: '# Budget annuel\n\n| Poste | Prévu | Réalisé |\n| --- | --- | --- |\n' },
  ],
};

export const BLUEPRINTS = [softwareDev, callForTender, companyManagement];

/** @param {string} kind */
export function blueprintFor(kind) {
  return BLUEPRINTS.find((b) => b.kind === kind) || softwareDev;
}

/** Vue publique (sans les gabarits complets) pour l'assistant côté navigateur. */
export function blueprintSummaries() {
  return BLUEPRINTS.map((b) => ({
    kind: b.kind,
    label: b.label,
    headline: b.headline,
    description: b.description,
    durationDays: b.durationDays,
    taskCount: countTasks(b.tasks),
    workflowName: b.workflow.name,
    documentCount: b.documents.length,
  }));
}

/** @param {Array<{ children?: any[] }>} nodes */
export function countTasks(nodes) {
  return nodes.reduce((total, node) => total + 1 + countTasks(node.children || []), 0);
}

/**
 * Aplatit l'arborescence d'un modèle en lignes prêtes à insérer.
 * @param {Array<object>} nodes
 * @param {{ parentKey?: string | null, path?: string }} [ctx]
 */
export function flattenBlueprintTasks(nodes, ctx = {}) {
  const { parentKey = null, path = '/' } = ctx;
  const rows = [];
  nodes.forEach((node, index) => {
    rows.push({
      key: node.key,
      parentKey,
      path,
      position: index,
      title: node.title,
      priority: node.priority || 'NORMAL',
      offsetDays: node.offsetDays ?? 0,
      durationDays: node.durationDays ?? 7,
      eventDashboard: node.eventDashboard || null,
      eventConfigure: node.eventConfigure || null,
    });
    if (node.children?.length) {
      rows.push(
        ...flattenBlueprintTasks(node.children, {
          parentKey: node.key,
          path: `${path === '/' ? '' : path}/${node.title}`,
        }),
      );
    }
  });
  return rows;
}
