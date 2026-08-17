/**
 * Charge la liste officielle des participants NOAI 2026 dans la base.
 *
 *   npm run db:seed:attestations
 *
 * Idempotent : relancer met à jour les noms et crée les attestations manquantes,
 * sans jamais toucher aux coordonnées saisies par les participants ni aux
 * compteurs de téléchargement.
 *
 * Les PDF sont rattachés dans un second temps par `scripts/import-attestations.mjs`.
 */
import '../server/load-env.mjs';
import { PrismaClient } from '@prisma/client';
import { NOAI_2026_PARTICIPANTS } from '../data/participants-noai-2026.js';

const prisma = new PrismaClient();

async function main() {
  const total = NOAI_2026_PARTICIPANTS.length;
  const bootcamp = NOAI_2026_PARTICIPANTS.filter((p) => p.kinds.includes('BOOTCAMP')).length;
  console.log(`[seed] ${total} participants, dont ${bootcamp} lauréats du bootcamp`);

  let createdParticipants = 0;
  let updatedParticipants = 0;
  let createdCertificates = 0;

  for (const row of NOAI_2026_PARTICIPANTS) {
    const existing = await prisma.participant.findUnique({
      where: { tableNumber: row.tableNumber },
      select: { id: true },
    });

    let participantId;
    if (existing) {
      // Seuls l'état civil officiel est réécrit : e-mail, téléphone et compteurs
      // appartiennent au participant et ne doivent pas être écrasés.
      await prisma.participant.update({
        where: { id: existing.id },
        data: { lastName: row.lastName, firstName: row.firstName },
      });
      participantId = existing.id;
      updatedParticipants += 1;
    } else {
      const created = await prisma.participant.create({
        data: {
          tableNumber: row.tableNumber,
          lastName: row.lastName,
          firstName: row.firstName,
        },
        select: { id: true },
      });
      participantId = created.id;
      createdParticipants += 1;
    }

    for (const kind of row.kinds) {
      const cert = await prisma.certificate.findUnique({
        where: { participantId_kind: { participantId, kind } },
        select: { id: true },
      });
      if (!cert) {
        await prisma.certificate.create({ data: { participantId, kind } });
        createdCertificates += 1;
      }
    }
  }

  const withPdf = await prisma.certificate.count({ where: { pdf: { not: null } } });
  const withoutPdf = await prisma.certificate.count({ where: { pdf: null } });

  console.log(`[seed] participants créés : ${createdParticipants} — mis à jour : ${updatedParticipants}`);
  console.log(`[seed] attestations créées : ${createdCertificates}`);
  console.log(`[seed] attestations avec PDF : ${withPdf} — en attente de PDF : ${withoutPdf}`);
}

main()
  .catch((e) => {
    console.error('[seed] échec :', e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
