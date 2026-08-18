import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const LMS_SEED_SLUGS = [
  'formation-ia',
  'mathematiques-ia-lycee',
  'machine-learning-lycee',
  'deep-learning-lycee',
  'nlp-lycee',
  'soft-skills-lycee',
];

async function main() {
  const tracks = await prisma.track.findMany({ where: { slug: { in: LMS_SEED_SLUGS } }, select: { id: true } });
  const trackIds = tracks.map((track) => track.id);
  const changes = await prisma.$transaction(async (tx) => {
    const lessons = trackIds.length
      ? await tx.$executeRawUnsafe(
          `UPDATE lessons SET module_id = NULL WHERE module_id IN (SELECT id FROM modules WHERE track_id = ANY($1::text[]))`,
          trackIds,
        )
      : 0;
    const enrollments = trackIds.length
      ? await tx.$executeRawUnsafe(`UPDATE enrollments SET track_id = NULL WHERE track_id = ANY($1::text[])`, trackIds)
      : 0;
    const deleted = await tx.track.deleteMany({ where: { id: { in: trackIds } } });
    return { lessons, enrollments, tracks: deleted.count };
  });
  console.log(JSON.stringify({ ok: true, changes }));
}

main()
  .finally(() => prisma.$disconnect())
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
