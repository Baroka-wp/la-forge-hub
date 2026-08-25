# La Forge Hub — Automation API

Ce dépôt contient l’application LMS + webinaires de La Forge Hub. La branche `feature/admin-automation-api` ajoute :

1. **Clé automation** pour accéder aux routes `/api/admin/*` sans session web.
2. **Script de déploiement Coolify** (`npm run deploy:coolify`) pour relancer l’application depuis des automatisations.

## Accès Automation

Définir dans l’environnement :

```bash
AUTOMATION_API_KEYS="key1,key2,..."
```

Une requête portant une clé valide est alors traitée comme administrateur par
`requireAdmin` : toutes les routes admin (webinaires, leçons, CRM) deviennent pilotables
par une automatisation. Les en-têtes acceptés et le format des charges utiles sont
décrits dans `api/_lib/automationAuth.js` et les handlers `api/admin-*.js`.

## Déploiement Coolify

Script : `scripts/coolify-deploy.mjs` (alias `npm run deploy:coolify`).

Variables requises :

- `COOLIFY_URL` — ex. `https://coolify.example.com`
- `COOLIFY_API_TOKEN` — token API Coolify (Settings → Access Tokens)
- `COOLIFY_APPLICATION_ID` — UUID de l’application « forge hub » dans Coolify

Commande :

```bash
COOLIFY_URL=... COOLIFY_API_TOKEN=... COOLIFY_APPLICATION_ID=... \
npm run deploy:coolify
```

Cela déclenche un redeploy via l’API `POST /api/v1/applications/:id/deploy`.

## Sécurité

- Garder la liste des clés automation courte et les stocker dans un coffre (1Password / Doppler).
- Régénérer une clé si elle est compromise (redémarrage nécessaire pour purger l’ancienne valeur).
- Les clés ne contournent que les routes admin (`requireAdmin`), le front public reste inchangé.

## EMONOS — Task Automation (espace `/emonos`)

Réalisation de la présentation *Task Manager : EMONOS*. L'espace est monté sur
`/emonos`, en plein écran, et réutilise la session La Forge Hub (aucune
authentification séparée : le deck décrit un écran de connexion, le compte du hub
en tient lieu). L'interface est en français ; les concepts du deck gardent leurs
noms (workflow, macro, `event_dashboard`, `event_configure`).

### Sections

| Route | Écran du deck | Contenu |
| --- | --- | --- |
| `/emonos` | Project management | Liste des projets, groupée par priorité, responsable ou étape ; assistant de création en quatre étapes ; fiche projet |
| `/emonos/timeline` | Project Timeline | Diagramme de Gantt des tâches datées (rendu maison, sans dépendance) |
| `/emonos/tasks` | Tasks management | Tâches empilées par jour d'échéance, arborescence, pagination, boutons latéraux et boutons par tâche |
| `/emonos/documents` | Documents templates | Modèles réutilisables et documents instanciés sur un projet |
| `/emonos/teams` | Team management | Équipes réutilisables, importables par l'assistant |
| `/emonos/workflows` | Workflow designer | Concepteur de graphe (étapes, décisions, nœuds « sous-tâche ») |
| `/emonos/config` | Configuration | Mes tâches, types de projet, workflows installés, macros disponibles |

### Assistant de création (quatre étapes)

1. **Projet** — nom, projet parent, priorité, notes.
2. **Type** — `SOFTWARE_DEV`, `CALL_FOR_TENDER` ou `COMPANY_MGMT`. Chaque type est
   un modèle (`api/_lib/emonos-blueprints.js`) qui décrit l'arborescence de tâches,
   les modèles de documents et le workflow à installer.
3. **Dates** — sans date, dates fixes, ou automatique (l'échéance découle de la
   durée du modèle ; les tâches sont datées par décalage depuis la date de début).
4. **Équipe** — automatique (équipe la moins chargée), sans équipe, ou une équipe
   existante, dont les membres deviennent membres du projet.

### Boutons du deck

Boutons latéraux : `+` (assistant contextuel), filtre **tâches critiques**, filtre
**tâches arrêtées**, bascule **archives**.

Boutons par tâche : `Éditer`, `Ouvrir` (descend d'un niveau, le fil d'Ariane
affiche `/Développement/Design`), `Archiver` (emporte la descendance), `Supprimer`,
plus deux actions personnalisées **affichées seulement si la macro est présente** :

- `event_dashboard` → `sprint_dashboard`, `budget_dashboard`, `tender_dashboard` :
  synthèse chiffrée de la branche (charge, avancement, retards, prochaine échéance).
- `event_configure` → `configure_repository`, `configure_ci`,
  `configure_review_board` : déploie une liste de sous-tâches, de façon idempotente.

Seules ces macros sont acceptées par l'API : une valeur libre est rejetée.

### Moteur de workflow

Un workflow est un graphe partagé par type de projet, édité dans le concepteur.
Le moteur avance une exécution (`WorkflowRun`) rattachée à un projet :

- un nœud `DECISION` exige la branche empruntée (`GO` / `NO GO`) ;
- un nœud `SUBTASK` instancie la tâche décrite par sa macro (idempotent par titre) ;
- l'étape du projet (`PRESALE` → `CLOSED`) suit le nœud atteint ;
- un nœud `END` clôt l'exécution.

L'enregistrement du graphe conserve les nœuds dont la clé n'a pas changé, pour que
les exécutions en cours restent rattachées à leur étape.

### Droits d'accès

Un projet est visible par son propriétaire, ses membres, les membres de l'équipe
rattachée, et les administrateurs de la plateforme. `VIEWER` est en lecture seule ;
`MEMBER` écrit ; `OWNER` et `MANAGER` administrent (suppression, membres, workflow).
Un projet inaccessible répond `404`, jamais `403`.

### Mise en service

```bash
npm run db:migrate                  # applique 20260825120000_emonos_task_manager
npm run db:seed:emonos              # équipes de démonstration + projet « LOGOS »
npm run db:seed:emonos -- --owner vous@exemple.com   # rattache la démo à votre compte
```

Le seed est idempotent : il ne recrée ni les équipes ni le projet `LOGOS`.

### Tests

```bash
npm test                            # inclut spec/tests/emonos.test.mjs
```

La suite couvre l'assistant, l'arborescence et le fil d'Ariane, les filtres du
deck, l'archivage en cascade, les deux familles de macros, le moteur de workflow
(décision `GO` / `NO GO`, nœud `SUBTASK`), la validation du concepteur et les
droits d'accès. Elle crée sa propre base :
`SPEC_DATABASE_URL` accepte un gabarit contenant `{db}` quand le rôle `baroka`
par défaut n'existe pas.

## Attestations NOAI 2026 (page `/attestations`)

Page publique non listée dans le menu, accessible par lien direct. Elle permet aux
participants des Olympiades Nationales d'Intelligence Artificielle 2026 de récupérer
leur attestation, et aux lauréats du bootcamp de récupérer la seconde.

Mise en service, dans l'ordre :

```bash
npm run db:migrate                  # crée participants / certificates / logs
npm run db:seed:attestations        # charge la liste des participants et leurs attestations
npm run db:import:attestations -- --kind NOAI \
  --pdf <dossier-pdf> --preview <dossier-apercus>
npm run db:import:attestations -- --kind BOOTCAMP \
  --pdf <dossier-pdf> --preview <dossier-apercus>
```

Les PDF ne sont pas versionnés (`data/attestations/` est ignoré) : ils sont stockés en
base et servis uniquement via un jeton signé de courte durée, délivré après vérification
de l'identité du demandeur. Les deux scripts sont idempotents et ne remettent jamais à
zéro les compteurs.

Chaque demande validée met à jour la fiche du participant, et les demandes en échec sont
conservées pour le support. Les colonnes exactes sont décrites dans `prisma/schema.prisma`
(`Participant`, `Certificate`, `CertificateRequest`, `CertificateDownload`) : le suivi des
relances et les statistiques de téléchargement se font directement en base, depuis un
poste autorisé.

Les recherches sont limitées par adresse réseau. Seule une empreinte HMAC anonyme est
stockée dans `certificate_rate_limits` ; elle utilise `RATE_LIMIT_SECRET` si cette
variable est définie, sinon le `JWT_SECRET` existant.

> Les données de participants relèvent du RGPD : ne pas recopier de noms, d'adresses
> e-mail, de numéros de téléphone ni de requêtes prêtes à l'emploi dans ce dépôt public,
> ni dans les tickets et les descriptions de pull request.
