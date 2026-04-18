import { prisma } from './_lib/prisma.js';
import { optionalUser } from './_lib/auth.js';
import { readJsonBody, sendJson, setCors } from './_lib/http.js';
import { normalizeEmail } from './_lib/email.js';
import { sendBrevoEmail, buildWebinarConfirmationEmail, webinarEmailLabels } from './_lib/brevo.js';
import { upsertMarketingContact } from './_lib/marketingContacts.js';

function normalizePhone(s) {
  return String(s ?? '').replace(/\s/g, '').trim();
}

function parseMarketingOptIn(body) {
  const v = body?.marketingOptIn;
  return v === true || v === 'true' || v === 1 || v === '1';
}

function validateGuestPayload(body) {
  const email = normalizeEmail(body.email);
  const fullName = String(body.fullName ?? '').trim();
  const phone = normalizePhone(body.phone ?? body.phoneWhatsapp ?? '');
  if (!email || !email.includes('@')) return { error: 'E-mail invalide.' };
  if (fullName.length < 2) return { error: 'Indiquez votre nom complet.' };
  if (phone.length < 8) return { error: 'Numéro WhatsApp invalide (minimum 8 chiffres).' };
  return { email, fullName, phone };
}

/** POST /api/webinars/:id/register — connecté (JWT) ou invité (corps JSON). */
export async function registerToWebinar(req, res) {
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
    const marketingOptIn = parseMarketingOptIn(body);
    const auth = await optionalUser(req);

    const id = req.params?.id;
    if (!id) return sendJson(res, 400, { error: 'id manquant' });

    const w = await prisma.webinar.findUnique({ where: { id } });
    if (!w || !w.published || w.kind !== 'EVENT') {
      return sendJson(res, 404, { error: 'Webinaire introuvable' });
    }
    if (!w.startsAt || w.startsAt <= new Date()) {
      return sendJson(res, 400, { error: 'Les inscriptions ne sont plus ouvertes pour ce webinaire.' });
    }

    if (auth.user) {
      const emailKey = normalizeEmail(auth.user.email);
      await prisma.webinarRegistration.create({
        data: {
          webinarId: id,
          userId: auth.user.id,
          emailKey,
          guestPhone: null,
          guestName: auth.user.displayName || null,
          marketingOptIn,
        },
      });
      await upsertMarketingContact({
        emailKey,
        displayName: auth.user.displayName,
        phone: null,
        marketingOptIn,
      });
      if (marketingOptIn) {
        await prisma.user.update({
          where: { id: auth.user.id },
          data: { marketingOptIn: true },
        });
      }
      const ctx = webinarEmailLabels(w);
      const { subject, htmlContent } = buildWebinarConfirmationEmail(w, ctx);
      await sendBrevoEmail({ email: emailKey, name: auth.user.displayName || undefined }, { subject, htmlContent });
      return sendJson(res, 201, { ok: true });
    }

    const g = validateGuestPayload(body);
    if (g.error) return sendJson(res, 400, { error: g.error });

    await prisma.webinarRegistration.create({
      data: {
        webinarId: id,
        userId: null,
        emailKey: g.email,
        guestPhone: g.phone,
        guestName: g.fullName,
        marketingOptIn,
      },
    });
    await upsertMarketingContact({
      emailKey: g.email,
      displayName: g.fullName,
      phone: g.phone,
      marketingOptIn,
    });
    const ctx = webinarEmailLabels(w);
    const { subject, htmlContent } = buildWebinarConfirmationEmail(w, ctx);
    await sendBrevoEmail({ email: g.email, name: g.fullName }, { subject, htmlContent });
    return sendJson(res, 201, { ok: true });
  } catch (e) {
    if (e.code === 'P2002') {
      return sendJson(res, 409, { error: 'Cette adresse e-mail est déjà inscrite pour ce webinaire.' });
    }
    console.error(e);
    return sendJson(res, 500, { error: e.message || 'Erreur serveur' });
  }
}
