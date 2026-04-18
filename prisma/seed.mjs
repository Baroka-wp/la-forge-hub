/**
 * Remplit la table `lessons` à partir de `RAW_SESSIONS` (src/seed-data.js).
 * Usage : npx prisma db seed   (après DATABASE_URL + prisma db push)
 */
import { PrismaClient } from '@prisma/client';
import { parseSessions, RAW_SESSIONS, COURSE } from '../src/seed-data.js';

const prisma = new PrismaClient();

async function main() {
  const sessions = parseSessions(RAW_SESSIONS);
  let pos = 0;
  for (const s of sessions) {
    pos += 1;
    const lessonId = `${COURSE.slug}-${String(pos).padStart(4, '0')}`;
    await prisma.lesson.upsert({
      where: { lessonId },
      create: {
        lessonId,
        courseSlug: COURSE.slug,
        position: pos,
        title: s.title,
        youtubeId: s.youtubeId,
        tag: s.tag,
        recordedAt: s.date instanceof Date ? s.date : new Date(s.date),
        collabUrl: null,
      },
      update: {
        title: s.title,
        youtubeId: s.youtubeId,
        tag: s.tag,
        recordedAt: s.date instanceof Date ? s.date : new Date(s.date),
      },
    });
  }
  console.log(`Seed lessons : ${pos} leçons pour ${COURSE.slug}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
