/**
 * Rattache les fichiers PDF (et leur aperçu JPEG) aux attestations déjà créées
 * par `npm run db:seed:attestations`.
 *
 *   node scripts/import-attestations.mjs --kind NOAI \
 *        --pdf data/attestations/noai/pdf --preview data/attestations/noai/preview
 *
 *   node scripts/import-attestations.mjs --kind BOOTCAMP \
 *        --pdf data/attestations/bootcamp/pdf --preview data/attestations/bootcamp/preview
 *
 * Les fichiers sont retrouvés par préfixe de numéro de table (NOAI_26_042*.pdf / .jpg).
 * Idempotent : relancer remplace les fichiers sans remettre à zéro les compteurs.
 */
import '../server/load-env.mjs';
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function findFile(dir, tableNumber, extensions) {
  if (!dir || !fs.existsSync(dir)) return null;
  const match = fs
    .readdirSync(dir)
    .find((f) => f.startsWith(tableNumber) && extensions.some((e) => f.toLowerCase().endsWith(e)));
  return match ? path.join(dir, match) : null;
}

async function main() {
  const kind = (arg('kind') || '').toUpperCase();
  const pdfDir = arg('pdf');
  const previewDir = arg('preview');

  if (!['NOAI', 'BOOTCAMP'].includes(kind)) throw new Error('--kind doit valoir NOAI ou BOOTCAMP');
  if (!pdfDir || !fs.existsSync(pdfDir)) throw new Error(`Dossier PDF introuvable : ${pdfDir}`);

  const certificates = await prisma.certificate.findMany({
    where: { kind },
    include: { participant: { select: { tableNumber: true } } },
  });
  console.log(`[import] ${certificates.length} attestations de type ${kind} en base`);
  if (certificates.length === 0) {
    throw new Error('Aucune attestation à alimenter : lancez d’abord `npm run db:seed:attestations`.');
  }

  let attached = 0;
  let withoutPreview = 0;
  const missing = [];

  for (const cert of certificates) {
    const table = cert.participant.tableNumber;
    const pdfPath = findFile(pdfDir, table, ['.pdf']);
    if (!pdfPath) {
      missing.push(table);
      continue;
    }
    const previewPath = findFile(previewDir, table, ['.jpg', '.jpeg']);
    if (!previewPath) withoutPreview += 1;

    await prisma.certificate.update({
      where: { id: cert.id },
      data: {
        fileName: path.basename(pdfPath),
        pdf: fs.readFileSync(pdfPath),
        previewImage: previewPath ? fs.readFileSync(previewPath) : null,
      },
    });
    attached += 1;
  }

  console.log(`[import] fichiers rattachés : ${attached}`);
  if (withoutPreview) console.log(`[import] sans aperçu JPEG : ${withoutPreview} (repli sur le PDF)`);
  if (missing.length) console.log(`[import] PDF manquants (${missing.length}) : ${missing.join(', ')}`);
}

main()
  .catch((e) => {
    console.error('[import] échec :', e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
