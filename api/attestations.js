import { prisma } from './_lib/prisma.js';
import { readJsonBody, sendJson, setCors } from './_lib/http.js';
import { signToken, verifyToken } from './_lib/jwt.js';

/**
 * Diffusion des attestations NOAI / Bootcamp IOAI.
 *
 * Deux points d'entrée :
 *  - POST /api/attestations/lookup  → vérifie le numéro de table + le nom, renvoie la liste
 *  - GET  /api/attestations/file    → sert le PDF ou l'aperçu, incrémente le compteur
 *
 * Le PDF n'est jamais servi par une URL devinable : il faut un jeton signé (30 min)
 * délivré uniquement par le lookup.
 */

const TOKEN_TTL = '30m';
const KIND_LABELS = {
  NOAI: 'Attestation de participation — NOAI 2026',
  BOOTCAMP: 'Attestation de participation — Bootcamp de préparation IOAI 2026',
};

/** Minuscules, sans accents ni ponctuation, espaces normalisés. */
function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Accepte NOAI_26_1, noai 26 001, 1, 001… → NOAI_26_001 */
function normalizeTableNumber(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const digits = raw.match(/(\d{1,3})\s*$/);
  if (!digits) return '';
  const n = Number(digits[1]);
  if (!Number.isInteger(n) || n < 1 || n > 999) return '';
  return `NOAI_26_${String(n).padStart(3, '0')}`;
}

/** Tous les mots du nom de famille doivent figurer dans la saisie du visiteur. */
function nameMatches(provided, lastName, firstName) {
  const input = normalize(provided);
  if (!input) return false;
  const inputTokens = new Set(input.split(' ').filter(Boolean));
  const lastTokens = normalize(lastName).split(' ').filter(Boolean);
  if (lastTokens.length && lastTokens.every((t) => inputTokens.has(t))) return true;
  // Filet de sécurité : nom complet identique dans un ordre quelconque.
  const full = normalize(`${lastName} ${firstName}`).split(' ').filter(Boolean);
  return full.length > 0 && full.every((t) => inputTokens.has(t));
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value || '').trim());
}

function isPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 15;
}

/** POST /api/attestations/lookup */
export async function lookupCertificates(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Méthode non autorisée' });
  }

  try {
    const body = await readJsonBody(req);
    const fullName = String(body.fullName || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const phone = String(body.phone || '').trim();
    const tableNumber = normalizeTableNumber(body.tableNumber);

    if (!fullName || !email || !phone || !String(body.tableNumber || '').trim()) {
      return sendJson(res, 400, { error: 'Tous les champs sont obligatoires.' });
    }
    if (!isEmail(email)) {
      return sendJson(res, 400, { error: 'Adresse e-mail invalide.' });
    }
    if (!isPhone(phone)) {
      return sendJson(res, 400, { error: 'Numéro de téléphone invalide.' });
    }
    if (!tableNumber) {
      await logRequest({ tableNumber: String(body.tableNumber).slice(0, 60), fullName, email, phone, outcome: 'NOT_FOUND' });
      return sendJson(res, 404, {
        found: false,
        reason: 'NOT_FOUND',
        error: "Ce numéro de table n'a pas le format attendu (exemple : NOAI_26_042).",
      });
    }

    const participant = await prisma.participant.findUnique({
      where: { tableNumber },
      include: {
        certificates: {
          where: { pdf: { not: null } },
          orderBy: { kind: 'asc' },
          select: { id: true, kind: true },
        },
      },
    });

    if (!participant) {
      await logRequest({ tableNumber, fullName, email, phone, outcome: 'NOT_FOUND' });
      return sendJson(res, 404, {
        found: false,
        reason: 'NOT_FOUND',
        error: "Aucun participant n'est rattaché à ce numéro de table.",
      });
    }

    if (!nameMatches(fullName, participant.lastName, participant.firstName)) {
      await logRequest({ tableNumber, fullName, email, phone, outcome: 'NAME_MISMATCH' });
      return sendJson(res, 403, {
        found: false,
        reason: 'NAME_MISMATCH',
        error: 'Le nom saisi ne correspond pas à ce numéro de table. Vérifiez votre saisie.',
      });
    }

    /**
     * Identité confirmée : on enrichit la fiche du participant avec les coordonnées
     * qu'il vient de fournir. Le compteur et les horodatages permettent de savoir
     * qui a récupéré son attestation, et qui reste à relancer.
     */
    const now = new Date();
    await prisma.participant.update({
      where: { id: participant.id },
      data: {
        email,
        phone,
        declaredName: fullName.slice(0, 160),
        requestCount: { increment: 1 },
        firstRequestAt: participant.firstRequestAt ?? now,
        lastRequestAt: now,
      },
    });

    await logRequest({ tableNumber, fullName, email, phone, outcome: 'FOUND' });

    if (participant.certificates.length === 0) {
      return sendJson(res, 404, {
        found: false,
        reason: 'NOT_READY',
        error:
          "Votre attestation n'est pas encore disponible en ligne. Vos coordonnées ont été enregistrées : contactez l'administrateur pour la recevoir.",
      });
    }

    const token = signToken({ scope: 'certificates', tableNumber, email }, { expiresIn: TOKEN_TTL });

    return sendJson(res, 200, {
      found: true,
      token,
      holder: {
        tableNumber: participant.tableNumber,
        fullName: `${participant.lastName} ${participant.firstName}`,
      },
      certificates: participant.certificates.map((c) => ({
        id: c.id,
        kind: c.kind,
        label: KIND_LABELS[c.kind] || 'Attestation de participation',
      })),
    });
  } catch (e) {
    console.error(e);
    return sendJson(res, 500, { error: 'Erreur serveur. Réessayez dans un instant.' });
  }
}

async function logRequest({ tableNumber, fullName, email, phone, outcome }) {
  try {
    await prisma.certificateRequest.create({
      data: {
        tableNumber,
        providedName: fullName.slice(0, 160),
        email: email.slice(0, 160),
        phone: phone.slice(0, 40),
        outcome,
      },
    });
  } catch (e) {
    console.error('[attestations] journalisation impossible', e);
  }
}

/**
 * GET /api/attestations/file?token=…&id=…&mode=preview|inline|download
 * `preview` renvoie l'image JPEG (ou le PDF inline si l'aperçu manque), sans compter.
 * `inline` renvoie toujours le PDF affichable dans l'onglet, sans compter.
 * `download` renvoie le PDF en pièce jointe et incrémente le compteur.
 */
export async function getCertificateFile(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: 'Méthode non autorisée' });
  }

  try {
    const query = new URLSearchParams((req.originalUrl || req.url || '').split('?')[1] || '');
    const token = query.get('token') || '';
    const id = query.get('id') || '';
    const requested = query.get('mode');
    const mode = ['download', 'inline', 'preview'].includes(requested) ? requested : 'preview';

    const payload = verifyToken(token);
    if (!payload || payload.scope !== 'certificates' || !payload.tableNumber) {
      return sendJson(res, 401, { error: 'Lien expiré. Relancez votre demande.' });
    }

    const certificate = await prisma.certificate.findUnique({
      where: { id },
      include: { participant: { select: { tableNumber: true } } },
    });
    if (!certificate || !certificate.pdf || certificate.participant.tableNumber !== payload.tableNumber) {
      return sendJson(res, 404, { error: 'Attestation introuvable.' });
    }

    if (mode === 'preview' && certificate.previewImage) {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'private, max-age=600');
      return res.end(Buffer.from(certificate.previewImage));
    }

    if (mode === 'download') {
      await prisma.$transaction([
        prisma.certificate.update({
          where: { id: certificate.id },
          data: { downloadCount: { increment: 1 } },
        }),
        prisma.certificateDownload.create({
          data: { certificateId: certificate.id, email: payload.email || null },
        }),
      ]);
    }

    const disposition = mode === 'download' ? 'attachment' : 'inline';
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${disposition}; filename="${certificate.fileName || 'attestation.pdf'}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    return res.end(Buffer.from(certificate.pdf));
  } catch (e) {
    console.error(e);
    return sendJson(res, 500, { error: 'Erreur serveur. Réessayez dans un instant.' });
  }
}
