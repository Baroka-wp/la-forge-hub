import { readJsonBody, sendJson, setCors } from './_lib/http.js';
import { checkCertificateLookupRateLimit } from './_lib/certificateRateLimit.js';
import { prisma } from './_lib/prisma.js';

const OFFERS = ['cybersecurite', 'ia_ml', 'passeport_numerique'];
const FORMATS = ['en_ligne', 'presentiel', 'hybride'];

const BUDGETS_BY_OFFER = {
  passeport_numerique: ['moins_15000', '15000-50000', '50000-100000', 'plus_100000'],
  cybersecurite: ['moins_50000', '50000-150000', '150000-300000', 'plus_300000'],
  ia_ml: ['moins_100000', '100000-250000', '250000-500000', 'plus_500000'],
};

function isNonEmptyString(value, maxLen = 200) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maxLen;
}

function isArrayOfStrings(value) {
  return Array.isArray(value) && value.length > 0 && value.every((v) => typeof v === 'string' && v);
}

export default async function submitSurvey(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Méthode non autorisée' });
  }

  try {
    const rateLimit = await checkCertificateLookupRateLimit(req, { namespace: 'survey', maxRequests: 8 });
    if (!rateLimit.allowed) {
      res.setHeader('Retry-After', String(rateLimit.retryAfterSeconds));
      return sendJson(res, 429, { error: 'Trop de tentatives. Patientez quelques minutes avant de réessayer.' });
    }

    const body = await readJsonBody(req);
    if (body.website) return sendJson(res, 200, { ok: true });

    const offrePrincipale = String(body.offre_principale || '');
    const offresInteressantes = body.offres_interessantes;
    const profil = body.profil && typeof body.profil === 'object' ? body.profil : {};
    const motivation = body.motivation;
    const motivationAutre = body.motivation_autre != null ? String(body.motivation_autre).trim().slice(0, 300) : null;
    const formatApprentissage = String(body.format_apprentissage || '');
    const villePresentiel = body.ville_presentiel != null ? String(body.ville_presentiel).trim().slice(0, 160) : null;
    const disponibilite = body.disponibilite && typeof body.disponibilite === 'object' ? body.disponibilite : {};
    const budget = String(body.budget || '');
    const contact = body.contact && typeof body.contact === 'object' ? body.contact : {};

    if (!OFFERS.includes(offrePrincipale) || !isArrayOfStrings(offresInteressantes) || !offresInteressantes.every((o) => OFFERS.includes(o))) {
      return sendJson(res, 400, { error: 'Offre(s) sélectionnée(s) invalide(s).' });
    }
    if (!isNonEmptyString(profil.statut) || !isNonEmptyString(profil.tranche_age) || !isNonEmptyString(profil.niveau_etudes) || !isNonEmptyString(profil.ville)) {
      return sendJson(res, 400, { error: 'Profil incomplet.' });
    }
    const needsPython = offresInteressantes.includes('ia_ml') || offresInteressantes.includes('passeport_numerique');
    if (needsPython && !isNonEmptyString(profil.niveau_python)) {
      return sendJson(res, 400, { error: 'Niveau Python manquant.' });
    }
    if (!isArrayOfStrings(motivation)) {
      return sendJson(res, 400, { error: 'Motivation manquante.' });
    }
    if (!FORMATS.includes(formatApprentissage)) {
      return sendJson(res, 400, { error: "Format d'apprentissage invalide." });
    }
    if ((formatApprentissage === 'presentiel' || formatApprentissage === 'hybride') && !isNonEmptyString(villePresentiel)) {
      return sendJson(res, 400, { error: 'Ville de présentiel manquante.' });
    }
    if (!isNonEmptyString(disponibilite.heuresSemaine) || !isNonEmptyString(disponibilite.rythme) || !isArrayOfStrings(disponibilite.creneaux)) {
      return sendJson(res, 400, { error: 'Disponibilité incomplète.' });
    }
    const validBudgets = BUDGETS_BY_OFFER[offrePrincipale] || [];
    if (!validBudgets.includes(budget)) {
      return sendJson(res, 400, { error: 'Budget invalide pour cette offre.' });
    }
    const contactNom = isNonEmptyString(contact.nom, 160) ? contact.nom.trim() : '';
    const contactWhatsapp = isNonEmptyString(contact.whatsapp, 40) ? contact.whatsapp.trim() : '';
    const contactEmail = contact.email != null ? String(contact.email).trim().slice(0, 160) : null;
    if (!contactNom || !contactWhatsapp || contact.consentement !== true) {
      return sendJson(res, 400, { error: 'Coordonnées ou consentement manquants.' });
    }

    await prisma.surveyResponse.create({
      data: {
        offrePrincipale,
        offresInteressantes,
        profil,
        motivation,
        motivationAutre,
        formatApprentissage,
        villePresentiel,
        disponibilite,
        budget,
        contactNom,
        contactWhatsapp,
        contactEmail: contactEmail || null,
        consentement: true,
      },
    });

    return sendJson(res, 201, { ok: true });
  } catch (e) {
    console.error('[survey]', e);
    return sendJson(res, 500, { error: 'Erreur serveur. Réessayez dans un instant.' });
  }
}
