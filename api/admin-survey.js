import { prisma } from './_lib/prisma.js';
import { requireAdmin } from './_lib/auth.js';
import { sendJson, setCors } from './_lib/http.js';

const OFFER_LABELS = {
  cybersecurite: 'Cybersécurité',
  ia_ml: 'IA / Machine Learning',
  passeport_numerique: 'Passeport Numérique',
};

/** GET /api/admin/survey — réponses au questionnaire d'opportunité (lecture seule). */
export default async function adminListSurveyResponses(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: 'Méthode non autorisée' });
  }
  try {
    const auth = await requireAdmin(req);
    if (auth.error) return sendJson(res, auth.status, { error: auth.error });

    const [total, rows, byOfferRaw] = await Promise.all([
      prisma.surveyResponse.count(),
      prisma.surveyResponse.findMany({ orderBy: { createdAt: 'desc' }, take: 500 }),
      prisma.surveyResponse.groupBy({ by: ['offrePrincipale'], _count: { _all: true } }),
    ]);

    const byOffer = byOfferRaw.map((g) => ({
      offer: g.offrePrincipale,
      label: OFFER_LABELS[g.offrePrincipale] || g.offrePrincipale,
      count: g._count._all,
    }));

    const responses = rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      offrePrincipale: r.offrePrincipale,
      offrePrincipaleLabel: OFFER_LABELS[r.offrePrincipale] || r.offrePrincipale,
      offresInteressantes: r.offresInteressantes,
      profil: r.profil,
      motivation: r.motivation,
      motivationAutre: r.motivationAutre,
      formatApprentissage: r.formatApprentissage,
      villePresentiel: r.villePresentiel,
      disponibilite: r.disponibilite,
      budget: r.budget,
      contactNom: r.contactNom,
      contactWhatsapp: r.contactWhatsapp,
      contactEmail: r.contactEmail,
    }));

    return sendJson(res, 200, { ok: true, total, byOffer, responses });
  } catch (e) {
    console.error('[admin-survey]', e);
    return sendJson(res, 500, { error: e.message || 'Erreur serveur' });
  }
}
