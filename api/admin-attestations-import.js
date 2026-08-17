import crypto from 'node:crypto';
import path from 'node:path';
import { prisma } from './_lib/prisma.js';
import { readJsonBody, sendJson } from './_lib/http.js';
import { NOAI_2026_PARTICIPANTS } from '../data/participants-noai-2026.js';

const MAX_FILE_BYTES = 2 * 1024 * 1024;

function authorized(req) {
  const expected = String(process.env.ATTESTATIONS_IMPORT_TOKEN || '');
  const supplied = String(req.headers['x-attestations-import-token'] || '');
  if (!expected || !supplied) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function decodeFile(value, label) {
  if (typeof value !== 'string' || !value) throw new Error(`${label} manquant`);
  const file = Buffer.from(value, 'base64');
  if (!file.length || file.length > MAX_FILE_BYTES) throw new Error(`${label} invalide ou trop volumineux`);
  return file;
}

async function seedParticipants() {
  let participants = 0;
  let certificates = 0;

  for (const row of NOAI_2026_PARTICIPANTS) {
    const participant = await prisma.participant.upsert({
      where: { tableNumber: row.tableNumber },
      create: {
        tableNumber: row.tableNumber,
        lastName: row.lastName,
        firstName: row.firstName,
      },
      update: { lastName: row.lastName, firstName: row.firstName },
      select: { id: true },
    });
    participants += 1;

    for (const kind of row.kinds) {
      await prisma.certificate.upsert({
        where: { participantId_kind: { participantId: participant.id, kind } },
        create: { participantId: participant.id, kind },
        update: {},
      });
      certificates += 1;
    }
  }

  return { participants, certificates };
}

async function importFile(body) {
  const tableNumber = String(body.tableNumber || '').trim();
  const kind = String(body.kind || '').toUpperCase();
  const fileName = path.basename(String(body.fileName || ''));
  if (!/^NOAI_26_\d{3}$/.test(tableNumber)) throw new Error('Numéro de table invalide');
  if (!['NOAI', 'BOOTCAMP'].includes(kind)) throw new Error("Type d'attestation invalide");
  if (!fileName.toLowerCase().endsWith('.pdf')) throw new Error('Nom de PDF invalide');

  const pdf = decodeFile(body.pdf, 'PDF');
  if (pdf.subarray(0, 5).toString('ascii') !== '%PDF-') throw new Error('Le fichier transmis n’est pas un PDF');
  const previewImage = decodeFile(body.previewImage, 'Aperçu');
  if (!(previewImage[0] === 0xff && previewImage[1] === 0xd8 && previewImage[2] === 0xff)) {
    throw new Error('L’aperçu transmis n’est pas un JPEG');
  }

  const participant = await prisma.participant.findUnique({
    where: { tableNumber },
    select: { id: true },
  });
  if (!participant) throw new Error('Participant introuvable');

  await prisma.certificate.update({
    where: { participantId_kind: { participantId: participant.id, kind } },
    data: { fileName, pdf, previewImage },
  });

  return { tableNumber, kind };
}

async function importStatus() {
  const [participants, certificates, ready] = await Promise.all([
    prisma.participant.count(),
    prisma.certificate.count(),
    prisma.certificate.count({ where: { pdf: { not: null }, previewImage: { not: null } } }),
  ]);
  return { participants, certificates, ready };
}

export default async function adminAttestationsImport(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Méthode non autorisée' });
  if (!authorized(req)) return sendJson(res, 401, { error: 'Accès import refusé' });

  try {
    const body = await readJsonBody(req);
    if (body.action === 'seed') return sendJson(res, 200, { ok: true, ...(await seedParticipants()) });
    if (body.action === 'file') return sendJson(res, 200, { ok: true, ...(await importFile(body)) });
    if (body.action === 'status') return sendJson(res, 200, { ok: true, ...(await importStatus()) });
    return sendJson(res, 400, { error: 'Action invalide' });
  } catch (error) {
    console.error('[attestations-import]', error);
    return sendJson(res, 400, { error: error.message || 'Import impossible' });
  }
}
