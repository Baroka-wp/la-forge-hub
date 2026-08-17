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

## Attestations NOAI 2026 (page `/attestations`)

Page publique non listée dans le menu, accessible par lien direct. Elle permet aux
participants des Olympiades Nationales d'Intelligence Artificielle 2026 de récupérer
leur attestation, et aux lauréats du bootcamp de récupérer la seconde.

Mise en service, dans l'ordre :

```bash
npm run db:migrate                  # crée participants / certificates / logs
npm run db:seed:attestations        # charge les 149 participants et leurs 169 attestations
npm run db:import:attestations -- --kind NOAI \
  --pdf data/attestations/noai/pdf --preview data/attestations/noai/preview
npm run db:import:attestations -- --kind BOOTCAMP \
  --pdf data/attestations/bootcamp/pdf --preview data/attestations/bootcamp/preview
```

La liste officielle vit dans `data/participants-noai-2026.js` et fait foi. Les PDF ne
sont pas versionnés (`data/attestations/` est ignoré) : ils sont stockés en base, servis
uniquement via un jeton signé de 30 minutes délivré après vérification du numéro de table
et du nom. Les deux scripts sont idempotents et ne remettent jamais à zéro les compteurs.

Chaque demande validée met à jour la fiche du participant (e-mail, téléphone, nom saisi,
nombre de demandes, première et dernière demande). Suivi des relances :

```sql
SELECT table_number, last_name, first_name, email, phone, last_request_at
FROM participants WHERE request_count = 0 ORDER BY table_number;
```

Statistiques de téléchargement :

```sql
SELECT p.table_number, p.last_name, c.kind, c.download_count
FROM certificates c JOIN participants p ON p.id = c.participant_id
ORDER BY c.download_count DESC;
```

Les demandes en échec (numéro inconnu, nom qui ne correspond pas) sont conservées dans
`certificate_requests` pour le support ; l'adresse d'assistance affichée est
birotori@gmail.com.
