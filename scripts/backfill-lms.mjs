import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TRACKS = [
  {
    slug: 'formation-ia', title: 'Programmation Python', discipline: 'PYTHON', segment: 'LYCEE', position: 1,
    published: true, summary: 'Le programme historique de La Forge Hub, conservé dans son intégralité.',
    module: { title: 'Programme initial', summary: 'Toutes les leçons du programme existant.', published: true },
  },
  {
    slug: 'mathematiques-ia-lycee', title: 'Mathématiques pour l’IA', discipline: 'MATH', segment: 'LYCEE', position: 2,
    published: false, module: { title: 'Fondations mathématiques', published: false },
  },
  {
    slug: 'machine-learning-lycee', title: 'Apprentissage automatique', discipline: 'ML', segment: 'LYCEE', position: 3,
    published: false, module: { title: 'Premiers modèles', published: false },
  },
  {
    slug: 'deep-learning-lycee', title: 'Apprentissage profond', discipline: 'DEEP', segment: 'LYCEE', position: 4,
    published: false, module: { title: 'Réseaux de neurones', published: false },
  },
  {
    slug: 'nlp-lycee', title: 'Traitement du langage naturel', discipline: 'NLP', segment: 'LYCEE', position: 5,
    published: false, module: { title: 'Comprendre le langage', published: false },
  },
  {
    slug: 'soft-skills-lycee', title: 'Compétences humaines', discipline: 'SOFT', segment: 'LYCEE', position: 6,
    published: false, module: { title: 'Présenter et collaborer', published: false },
  },
];

async function main() {
  const changes = { tracks: 0, modules: 0, lessons: 0, enrollments: 0 };
  let legacyTrack = null;
  let legacyModule = null;

  await prisma.$transaction(async (tx) => {
    for (const definition of TRACKS) {
      let track = await tx.track.findUnique({ where: { slug: definition.slug } });
      if (!track) {
        track = await tx.track.create({
          data: {
            id: crypto.randomUUID(),
            slug: definition.slug,
            title: definition.title,
            summary: definition.summary || null,
            discipline: definition.discipline,
            segment: definition.segment,
            position: definition.position,
            published: definition.published,
          },
        });
        changes.tracks += 1;
      }

      let module = await tx.module.findUnique({
        where: { trackId_position: { trackId: track.id, position: 1 } },
      });
      if (!module) {
        module = await tx.module.create({
          data: {
            id: crypto.randomUUID(),
            trackId: track.id,
            title: definition.module.title,
            summary: definition.module.summary || null,
            position: 1,
            published: definition.module.published,
          },
        });
        changes.modules += 1;
      }

      if (definition.slug === 'formation-ia') {
        legacyTrack = track;
        legacyModule = module;
      }
    }

    changes.lessons = await tx.$executeRawUnsafe(
      `UPDATE lessons SET module_id = $1, kind = 'VIDEO', published = true
       WHERE course_slug = 'formation-ia' AND module_id IS NULL`,
      legacyModule.id,
    );

    changes.enrollments = await tx.$executeRawUnsafe(
      `UPDATE enrollments SET track_id = $1
       WHERE course_slug = 'formation-ia' AND track_id IS NULL`,
      legacyTrack.id,
    );
  });

  console.log(JSON.stringify({ ok: true, changes }));
}

main()
  .finally(() => prisma.$disconnect())
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
