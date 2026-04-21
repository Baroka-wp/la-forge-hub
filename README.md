# La Forge Hub — Automation API

Ce dépôt contient l’application LMS + webinaires de La Forge Hub. La branche `feature/admin-automation-api` ajoute :

1. **Clé automation** pour accéder aux routes `/api/admin/*` sans session web (header `X-Automation-Key`).
2. **Script de déploiement Coolify** (`npm run deploy:coolify`) pour relancer l’application depuis des automatisations.

## Accès Automation

Définir dans l’environnement :

```bash
AUTOMATION_API_KEYS="key1,key2,..."
```

Ensuite, toute requête HTTP contenant `X-Automation-Key: key1` (ou `X-API-Key`) est traitée comme un administrateur par `requireAdmin`.

Exemples :

```bash
curl -X POST https://forgehub.example.com/api/admin/webinars \
  -H "X-Automation-Key: $AUTOMATION_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Atelier IA", "description": "...", "tag": "atelier",
    "startsAt": "2025-05-20T18:00:00Z",
    "locationType": "ONLINE",
    "onlineLink": "https://meet.google.com/..."
  }'

curl -X PATCH https://forgehub.example.com/api/admin/webinars/<id> \
  -H "X-Automation-Key: $AUTOMATION_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "recordingUrl": "https://youtube.com/..." }'
```

Toutes les routes admin existantes (webinaires, leçons, CRM) sont ainsi pilotables par un bot.

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
