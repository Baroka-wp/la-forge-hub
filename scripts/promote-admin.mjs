/**
 * Donne le rôle admin à un utilisateur existant (e-mail en base).
 * Usage : npm run admin:promote -- vous@email.com
 * Nécessite DATABASE_URL dans .env à la racine du projet.
 */
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const prisma = new PrismaClient();
const emailArg = process.argv[2];
const email = (emailArg || '').trim().toLowerCase();
if (!email) {
  console.error('Usage : npm run admin:promote -- vous@email.com');
  process.exit(1);
}

try {
  const u = await prisma.user.update({
    where: { email },
    data: { role: 'admin' },
    select: { email: true, role: true },
  });
  console.log(`OK — ${u.email} est maintenant admin (role=${u.role}).`);
} catch (e) {
  if (e.code === 'P2025') {
    console.error(`Aucun utilisateur avec l’e-mail : ${email}`);
  } else {
    console.error(e.message || e);
  }
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
