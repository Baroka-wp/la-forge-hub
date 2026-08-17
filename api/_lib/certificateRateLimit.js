import crypto from 'node:crypto';
import { prisma } from './prisma.js';

function headerValue(req, name) {
  const value = req.headers?.[name];
  if (Array.isArray(value)) return value[0] || '';
  return String(value || '').trim();
}

function clientAddress(req) {
  const forwarded = headerValue(req, 'x-forwarded-for').split(',')[0]?.trim();
  return (
    headerValue(req, 'cf-connecting-ip') ||
    headerValue(req, 'x-real-ip') ||
    forwarded ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

function anonymousNetworkKey(req, namespace) {
  const secret = String(process.env.RATE_LIMIT_SECRET || process.env.JWT_SECRET || '').trim();
  if (!secret) throw new Error('RATE_LIMIT_SECRET ou JWT_SECRET manquant');
  return crypto.createHmac('sha256', secret).update(`${namespace}:${clientAddress(req)}`).digest('hex');
}

/**
 * Fenêtre fixe persistante : cinq recherches au maximum en dix minutes.
 * L'UPSERT PostgreSQL rend l'incrément atomique, même avec plusieurs instances.
 */
export async function checkCertificateLookupRateLimit(req, options = {}) {
  const namespace = String(options.namespace || 'lookup');
  const maxRequests = Number(options.maxRequests || 5);
  const ipHash = anonymousNetworkKey(req, namespace);
  const rows = await prisma.$queryRaw`
    INSERT INTO "certificate_rate_limits" ("ip_hash", "window_started_at", "request_count", "updated_at")
    VALUES (${ipHash}, NOW(), 1, NOW())
    ON CONFLICT ("ip_hash") DO UPDATE SET
      "request_count" = CASE
        WHEN "certificate_rate_limits"."window_started_at" <= NOW() - INTERVAL '10 minutes' THEN 1
        ELSE "certificate_rate_limits"."request_count" + 1
      END,
      "window_started_at" = CASE
        WHEN "certificate_rate_limits"."window_started_at" <= NOW() - INTERVAL '10 minutes' THEN NOW()
        ELSE "certificate_rate_limits"."window_started_at"
      END,
      "updated_at" = NOW()
    RETURNING
      "request_count" AS "requestCount",
      GREATEST(
        1,
        CEIL(EXTRACT(EPOCH FROM ("window_started_at" + INTERVAL '10 minutes' - NOW())))
      )::integer AS "retryAfterSeconds"
  `;

  const state = rows[0];
  const allowed = Number(state?.requestCount || 0) <= maxRequests;
  const retryAfterSeconds = allowed ? 0 : Number(state?.retryAfterSeconds || 1);

  return { allowed, retryAfterSeconds };
}
