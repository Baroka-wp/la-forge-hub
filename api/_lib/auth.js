import { verifyToken } from './jwt.js';
import { getBearer } from './http.js';
import { prisma } from './prisma.js';
import { automationUserFromRequest } from './automationAuth.js';

/** @param {{ role?: string } | null} user */
export function isUserAdmin(user) {
  return user?.role === 'admin';
}

/** @param {import('http').IncomingMessage} req */
export async function requireUser(req) {
  const token = getBearer(req);
  if (!token) return { error: 'Non authentifié', status: 401 };
  const payload = verifyToken(token);
  if (!payload?.sub) return { error: 'Token invalide', status: 401 };
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, email: true, displayName: true, role: true },
  });
  if (!user) return { error: 'Utilisateur introuvable', status: 401 };
  return { user };
}

/** JWT + colonne `users.role = admin` ou clé automation */
export async function requireAdmin(req) {
  const automationUser = automationUserFromRequest(req);
  if (automationUser) {
    return { user: automationUser, automation: true };
  }
  const u = await requireUser(req);
  if (u.error) return u;
  if (!isUserAdmin(u.user)) {
    return { error: 'Accès administrateur refusé', status: 403 };
  }
  return { user: u.user };
}

/**
 * Utilisateur connecté si le Bearer est valide, sinon `user: null` (pas d’erreur).
 * @returns {Promise<{ user: { id: string, email: string, displayName: string, role: string } | null }>}
 */
export async function optionalUser(req) {
  const token = getBearer(req);
  if (!token) return { user: null };
  const payload = verifyToken(token);
  if (!payload?.sub) return { user: null };
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, email: true, displayName: true, role: true },
  });
  return { user: user || null };
}
