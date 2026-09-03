/**
 * Page publique non listée : /opportunite
 * Enquête de mesure de la demande (Cybersécurité, IA/ML, Passeport Numérique)
 * avant la reprise du partenariat avec Dive into Code. Sert aussi de collecte de leads.
 */

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const OFFERS = [
  { code: 'cybersecurite', label: 'Cybersécurité' },
  { code: 'ia_ml', label: 'Intelligence Artificielle / Machine Learning' },
  { code: 'passeport_numerique', label: 'Passeport Numérique (initiation au code, compréhension du web, bases Python)' },
];

const STATUTS = [
  ['lyceen', 'Lycéen(ne)'],
  ['etudiant', 'Étudiant(e)'],
  ['salarie', 'Salarié(e)'],
  ['entrepreneur', 'Entrepreneur / indépendant'],
  ['fonctionnaire', 'Fonctionnaire'],
  ['sans_emploi', 'Sans emploi ou en recherche'],
  ['autre', 'Autre'],
];
const TRANCHES_AGE = [
  ['moins_18', 'Moins de 18 ans'],
  ['18-24', '18 à 24 ans'],
  ['25-34', '25 à 34 ans'],
  ['35-44', '35 à 44 ans'],
  ['45+', '45 ans et plus'],
];
const NIVEAUX_ETUDES = [
  ['aucun', 'Aucun'],
  ['brevet', 'Brevet'],
  ['bac', 'Baccalauréat'],
  ['bac2', 'Bac+2'],
  ['licence', 'Licence'],
  ['master', 'Master'],
  ['doctorat', 'Doctorat'],
  ['autre', 'Autre'],
];
const NIVEAUX_PYTHON = [
  ['aucune_connaissance', 'Aucune connaissance'],
  ['notions_de_base', 'Notions de base'],
  ['intermediaire', 'Niveau intermédiaire'],
  ['avance', 'Niveau avancé'],
];
const MOTIVATIONS = [
  ['trouver_emploi', 'Trouver un emploi ou me reconvertir'],
  ['evoluer_poste', 'Évoluer dans mon poste actuel'],
  ['lancer_projet', 'Lancer un projet ou une entreprise'],
  ['curiosite', 'Curiosité personnelle'],
  ['recommandation', "Recommandation d'un tiers"],
  ['autre', 'Autre'],
];
const FORMATS = [
  ['en_ligne', '100% en ligne'],
  ['presentiel', '100% présentiel'],
  ['hybride', 'Hybride'],
];
const HEURES_SEMAINE = [
  ['moins_2h', 'Moins de 2h'],
  ['2-4h', '2 à 4h'],
  ['4-8h', '4 à 8h'],
  ['plus_8h', 'Plus de 8h'],
];
const RYTHMES = [
  ['intensif_2_4_semaines', 'Intensif sur 2 à 4 semaines'],
  ['etale_1x_semaine', 'Étalé sur plusieurs mois, à raison d’une fois par semaine'],
  ['etale_2_3x_semaine', 'Étalé, à raison de 2 à 3 fois par semaine'],
];
const CRENEAUX = [
  ['semaine_jour', 'Semaine, en journée'],
  ['semaine_soir', 'Semaine, en soirée'],
  ['weekend', 'Week-end'],
];
const BUDGETS_BY_OFFER = {
  passeport_numerique: [
    ['moins_15000', 'Moins de 15 000 FCFA'],
    ['15000-50000', '15 000 à 50 000 FCFA'],
    ['50000-100000', '50 000 à 100 000 FCFA'],
    ['plus_100000', 'Plus de 100 000 FCFA'],
  ],
  cybersecurite: [
    ['moins_50000', 'Moins de 50 000 FCFA'],
    ['50000-150000', '50 000 à 150 000 FCFA'],
    ['150000-300000', '150 000 à 300 000 FCFA'],
    ['plus_300000', 'Plus de 300 000 FCFA'],
  ],
  ia_ml: [
    ['moins_100000', 'Moins de 100 000 FCFA'],
    ['100000-250000', '100 000 à 250 000 FCFA'],
    ['250000-500000', '250 000 à 500 000 FCFA'],
    ['plus_500000', 'Plus de 500 000 FCFA'],
  ],
};

const FORM_STEPS = 7;

function needsPython(offresInteressantes) {
  return offresInteressantes.includes('ia_ml') || offresInteressantes.includes('passeport_numerique');
}

function choiceGroup(name, options, type, selected) {
  const sel = Array.isArray(selected) ? selected : [selected].filter(Boolean);
  return `<div class="survey-choices">${options
    .map(
      ([code, label]) => `
      <label class="survey-choice">
        <input type="${type}" name="${name}" value="${code}" ${sel.includes(code) ? 'checked' : ''} />
        <span>${escapeHtml(label)}</span>
      </label>`,
    )
    .join('')}</div>`;
}

function step1Render(answers) {
  const isMultiple = answers.offresInteressantes.length > 1;
  const single = !isMultiple ? answers.offresInteressantes[0] || '' : '';
  return `
    <h2 class="survey-q">Quelle formation vous intéresse le plus ?</h2>
    ${choiceGroup(
      'offreChoice',
      [...OFFERS.map((o) => [o.code, o.label]), ['plusieurs', "Plusieurs m'intéressent"]],
      'radio',
      isMultiple ? 'plusieurs' : single,
    )}
    <div class="survey-subfield" data-when="offreChoice=plusieurs">
      <p class="survey-hint">Classez les offres par ordre de préférence (1 = la plus importante).</p>
      <div class="survey-rank-list">
        ${OFFERS.map(
          (o) => `
          <div class="survey-rank-row">
            <span>${escapeHtml(o.label)}</span>
            <select name="rank_${o.code}">
              <option value="">-</option>
              ${[1, 2, 3]
                .map(
                  (n) =>
                    `<option value="${n}" ${answers.rankOf[o.code] === n ? 'selected' : ''}>${n}</option>`,
                )
                .join('')}
            </select>
          </div>`,
        ).join('')}
      </div>
    </div>
    <p class="survey-error" data-error></p>`;
}

function step1Validate(container, answers) {
  const choice = container.querySelector('input[name="offreChoice"]:checked')?.value || '';
  if (!choice) return { ok: false, error: 'Choisissez une option.' };
  if (choice !== 'plusieurs') {
    return { ok: true, patch: { offresInteressantes: [choice], rankOf: {} } };
  }
  const ranks = {};
  for (const o of OFFERS) {
    const v = Number(container.querySelector(`select[name="rank_${o.code}"]`)?.value || 0);
    if (!v) return { ok: false, error: 'Classez les trois offres (1, 2 et 3).' };
    ranks[o.code] = v;
  }
  const used = new Set(Object.values(ranks));
  if (used.size !== 3) return { ok: false, error: 'Chaque rang (1, 2, 3) doit être utilisé une seule fois.' };
  const ordered = [...OFFERS].sort((a, b) => ranks[a.code] - ranks[b.code]).map((o) => o.code);
  return { ok: true, patch: { offresInteressantes: ordered, rankOf: ranks } };
}

function step2Render(answers) {
  const p = answers.profil;
  const showSecteur = p.statut === 'salarie' || p.statut === 'entrepreneur';
  const showPython = needsPython(answers.offresInteressantes);
  return `
    <h2 class="survey-q">Votre profil</h2>
    <p class="survey-label">Statut actuel</p>
    ${choiceGroup('statut', STATUTS, 'radio', p.statut)}
    <div class="survey-subfield" data-when="statut=salarie|entrepreneur">
      <label class="survey-field"><span>Secteur d'activité ou métier</span>
        <input type="text" name="secteurMetier" value="${escapeHtml(p.secteurMetier)}" maxlength="160" />
      </label>
    </div>
    <p class="survey-label">Tranche d'âge</p>
    ${choiceGroup('trancheAge', TRANCHES_AGE, 'radio', p.trancheAge)}
    <label class="survey-field"><span>Dernier niveau d'études</span>
      <select name="niveauEtudes">
        <option value="">Sélectionnez</option>
        ${NIVEAUX_ETUDES.map(([c, l]) => `<option value="${c}" ${p.niveauEtudes === c ? 'selected' : ''}>${escapeHtml(l)}</option>`).join('')}
      </select>
    </label>
    <label class="survey-field"><span>Ville ou commune de résidence</span>
      <input type="text" name="ville" value="${escapeHtml(p.ville)}" maxlength="160" />
    </label>
    ${
      showPython
        ? `<p class="survey-label">Quel est votre niveau actuel en Python ?</p>${choiceGroup('niveauPython', NIVEAUX_PYTHON, 'radio', p.niveauPython)}`
        : ''
    }
    <p class="survey-error" data-error></p>`;
}

function step2Validate(container, answers) {
  const statut = container.querySelector('input[name="statut"]:checked')?.value || '';
  const trancheAge = container.querySelector('input[name="trancheAge"]:checked')?.value || '';
  const niveauEtudes = container.querySelector('select[name="niveauEtudes"]')?.value || '';
  const ville = container.querySelector('input[name="ville"]')?.value.trim() || '';
  if (!statut || !trancheAge || !niveauEtudes || !ville) {
    return { ok: false, error: 'Merci de renseigner tous les champs.' };
  }
  const secteurMetier =
    statut === 'salarie' || statut === 'entrepreneur'
      ? container.querySelector('input[name="secteurMetier"]')?.value.trim() || ''
      : '';
  if ((statut === 'salarie' || statut === 'entrepreneur') && !secteurMetier) {
    return { ok: false, error: 'Précisez votre secteur d’activité ou métier.' };
  }
  let niveauPython = '';
  if (needsPython(answers.offresInteressantes)) {
    niveauPython = container.querySelector('input[name="niveauPython"]:checked')?.value || '';
    if (!niveauPython) return { ok: false, error: 'Indiquez votre niveau en Python.' };
  }
  return {
    ok: true,
    patch: { profil: { ...answers.profil, statut, secteurMetier, trancheAge, niveauEtudes, ville, niveauPython } },
  };
}

function step3Render(answers) {
  const showAutre = answers.motivation.includes('autre');
  return `
    <h2 class="survey-q">Qu'est-ce qui motive votre intérêt ?</h2>
    <p class="survey-hint">Plusieurs réponses possibles.</p>
    ${choiceGroup('motivation', MOTIVATIONS, 'checkbox', answers.motivation)}
    <div class="survey-subfield" data-when="motivation=autre">
      <label class="survey-field"><span>Précisez</span>
        <input type="text" name="motivationAutre" value="${escapeHtml(answers.motivationAutre)}" maxlength="300" />
      </label>
    </div>
    <p class="survey-error" data-error></p>`;
}

function step3Validate(container, answers) {
  const motivation = Array.from(container.querySelectorAll('input[name="motivation"]:checked')).map((i) => i.value);
  if (!motivation.length) return { ok: false, error: 'Choisissez au moins une réponse.' };
  const motivationAutre = motivation.includes('autre')
    ? container.querySelector('input[name="motivationAutre"]')?.value.trim() || ''
    : '';
  if (motivation.includes('autre') && !motivationAutre) {
    return { ok: false, error: 'Précisez votre motivation.' };
  }
  return { ok: true, patch: { motivation, motivationAutre } };
}

function step4Render(answers) {
  return `
    <h2 class="survey-q">Quel format d'apprentissage préférez-vous ?</h2>
    ${choiceGroup('formatApprentissage', FORMATS, 'radio', answers.formatApprentissage)}
    <div class="survey-subfield" data-when="formatApprentissage=presentiel|hybride">
      <label class="survey-field"><span>Ville où vous pourriez vous déplacer</span>
        <input type="text" name="villePresentiel" value="${escapeHtml(answers.villePresentiel)}" maxlength="160" />
      </label>
    </div>
    <p class="survey-error" data-error></p>`;
}

function step4Validate(container, answers) {
  const formatApprentissage = container.querySelector('input[name="formatApprentissage"]:checked')?.value || '';
  if (!formatApprentissage) return { ok: false, error: 'Choisissez un format.' };
  let villePresentiel = '';
  if (formatApprentissage === 'presentiel' || formatApprentissage === 'hybride') {
    villePresentiel = container.querySelector('input[name="villePresentiel"]')?.value.trim() || '';
    if (!villePresentiel) return { ok: false, error: 'Indiquez la ville où vous pourriez vous déplacer.' };
  }
  return { ok: true, patch: { formatApprentissage, villePresentiel } };
}

function step5Render(answers) {
  const d = answers.disponibilite;
  return `
    <h2 class="survey-q">Combien d'heures par semaine pouvez-vous consacrer à la formation ?</h2>
    ${choiceGroup('heuresSemaine', HEURES_SEMAINE, 'radio', d.heuresSemaine)}
    <p class="survey-label">Rythme préféré</p>
    ${choiceGroup('rythme', RYTHMES, 'radio', d.rythme)}
    <p class="survey-label">Créneaux préférés</p>
    <p class="survey-hint">Plusieurs réponses possibles.</p>
    ${choiceGroup('creneaux', CRENEAUX, 'checkbox', d.creneaux)}
    <p class="survey-error" data-error></p>`;
}

function step5Validate(container, answers) {
  const heuresSemaine = container.querySelector('input[name="heuresSemaine"]:checked')?.value || '';
  const rythme = container.querySelector('input[name="rythme"]:checked')?.value || '';
  const creneaux = Array.from(container.querySelectorAll('input[name="creneaux"]:checked')).map((i) => i.value);
  if (!heuresSemaine || !rythme || !creneaux.length) {
    return { ok: false, error: 'Merci de renseigner votre disponibilité.' };
  }
  return { ok: true, patch: { disponibilite: { heuresSemaine, rythme, creneaux } } };
}

function step6Render(answers) {
  const offrePrincipale = answers.offresInteressantes[0];
  const options = BUDGETS_BY_OFFER[offrePrincipale] || [];
  return `
    <h2 class="survey-q">Combien seriez-vous prêt à payer pour cette formation ?</h2>
    ${choiceGroup('budget', options, 'radio', answers.budget)}
    <p class="survey-error" data-error></p>`;
}

function step6Validate(container) {
  const budget = container.querySelector('input[name="budget"]:checked')?.value || '';
  if (!budget) return { ok: false, error: 'Choisissez une tranche de budget.' };
  return { ok: true, patch: { budget } };
}

function step7Render(answers) {
  const c = answers.contact;
  return `
    <h2 class="survey-q">Vos coordonnées</h2>
    <label class="survey-field"><span>Nom complet</span>
      <input type="text" name="nom" value="${escapeHtml(c.nom)}" maxlength="160" autocomplete="name" />
    </label>
    <label class="survey-field"><span>Numéro WhatsApp</span>
      <input type="tel" name="whatsapp" value="${escapeHtml(c.whatsapp)}" maxlength="40" autocomplete="tel" placeholder="+229 01 XX XX XX XX" />
    </label>
    <label class="survey-field"><span>E-mail (facultatif)</span>
      <input type="email" name="email" value="${escapeHtml(c.email)}" maxlength="160" autocomplete="email" />
    </label>
    <label class="survey-consent">
      <input type="checkbox" name="consentement" ${c.consentement ? 'checked' : ''} />
      <span>J'accepte d'être recontacté par Africa Samurai au sujet de cette formation.</span>
    </label>
    <label class="survey-honeypot" aria-hidden="true">Site web<input type="text" name="website" tabindex="-1" autocomplete="off" /></label>
    <p class="survey-error" data-error></p>`;
}

function isPlausibleEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

function step7Validate(container) {
  const nom = container.querySelector('input[name="nom"]')?.value.trim() || '';
  const whatsapp = container.querySelector('input[name="whatsapp"]')?.value.trim() || '';
  const email = container.querySelector('input[name="email"]')?.value.trim() || '';
  const consentement = !!container.querySelector('input[name="consentement"]')?.checked;
  const website = container.querySelector('input[name="website"]')?.value.trim() || '';
  if (!nom || !whatsapp) return { ok: false, error: 'Nom et numéro WhatsApp sont obligatoires.' };
  if (email && !isPlausibleEmail(email)) return { ok: false, error: 'Adresse e-mail invalide.' };
  if (!consentement) return { ok: false, error: 'Merci d’accepter d’être recontacté pour continuer.' };
  return { ok: true, patch: { contact: { nom, whatsapp, email, consentement }, website } };
}

const STEPS = [
  { render: step1Render, validate: step1Validate },
  { render: step2Render, validate: step2Validate },
  { render: step3Render, validate: step3Validate },
  { render: step4Render, validate: step4Validate },
  { render: step5Render, validate: step5Validate },
  { render: step6Render, validate: step6Validate },
  { render: step7Render, validate: step7Validate },
];

function initialAnswers() {
  return {
    offresInteressantes: [],
    rankOf: {},
    profil: { statut: '', secteurMetier: '', trancheAge: '', niveauEtudes: '', ville: '', niveauPython: '' },
    motivation: [],
    motivationAutre: '',
    formatApprentissage: '',
    villePresentiel: '',
    disponibilite: { heuresSemaine: '', rythme: '', creneaux: [] },
    budget: '',
    contact: { nom: '', whatsapp: '', email: '', consentement: false },
  };
}

function buildPayload(a) {
  return {
    offre_principale: a.offresInteressantes[0],
    offres_interessantes: a.offresInteressantes,
    profil: {
      statut: a.profil.statut,
      secteur_metier: a.profil.secteurMetier || null,
      tranche_age: a.profil.trancheAge,
      niveau_etudes: a.profil.niveauEtudes,
      ville: a.profil.ville,
      niveau_python: a.profil.niveauPython || null,
    },
    motivation: a.motivation,
    motivation_autre: a.motivationAutre || null,
    format_apprentissage: a.formatApprentissage,
    ville_presentiel: a.villePresentiel || null,
    disponibilite: a.disponibilite,
    budget: a.budget,
    contact: {
      nom: a.contact.nom,
      whatsapp: a.contact.whatsapp,
      email: a.contact.email || null,
      consentement: a.contact.consentement,
    },
  };
}

const HERO_ICON_AI = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="2.2"/><circle cx="5" cy="16" r="2.2"/><circle cx="19" cy="16" r="2.2"/><path d="M12 7.2v3M10.3 9.6 6.7 14M13.7 9.6l3.6 4.4"/></svg>`;
const HERO_ICON_SHIELD = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5 5 6v5.5c0 4.3 2.9 7.6 7 8.5 4.1-.9 7-4.2 7-8.5V6l-7-2.5Z"/><path d="m9 12 2 2 4-4.2"/></svg>`;
const HERO_ICON_CODE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m9 8-4 4 4 4M15 8l4 4-4 4"/></svg>`;

export function renderSurveyPageHtml() {
  return `
    <div class="survey-page">
      <div class="survey-sheet">
        <div class="survey-hero" id="surveyHero">
          <div class="survey-hero-visual" aria-hidden="true">
            <span class="survey-hero-icon survey-hero-icon--a">${HERO_ICON_AI}</span>
            <span class="survey-hero-icon survey-hero-icon--b">${HERO_ICON_SHIELD}</span>
            <span class="survey-hero-icon survey-hero-icon--c">${HERO_ICON_CODE}</span>
          </div>
          <span class="survey-badge">Partenariat Bénin × Japon</span>
          <h1 class="survey-title">Formez-vous en <span class="survey-kw">Intelligence Artificielle</span>, <span class="survey-kw">Cybersécurité</span> ou décrochez votre <span class="survey-kw">Passeport Numérique</span></h1>
          <p class="survey-sub">Pédagogie d'ingénierie japonaise, dans la continuité de la stratégie nationale IA du Bénin. Tarif de lancement réservé aux premiers répondants.</p>
          <button type="button" class="btn btn-primary btn-lg" id="surveyStartBtn">Je réponds maintenant</button>
          <p class="survey-microtext">3 minutes seulement, sans engagement</p>
        </div>
        <div class="survey-wizard" id="surveyWizard" hidden>
          <div class="survey-progress"><div class="survey-progress-bar" id="surveyProgressBar"></div></div>
          <p class="survey-step-label" id="surveyStepLabel"></p>
          <div class="survey-form" id="surveyForm">
            <div id="surveyStepBody"></div>
            <div class="survey-nav">
              <button type="button" class="btn btn-secondary" id="surveyPrevBtn" hidden>Précédent</button>
              <button type="button" class="btn btn-primary" id="surveyNextBtn">Suivant</button>
            </div>
          </div>
        </div>
        <div class="survey-done" id="surveyDone" hidden>
          <h2 class="survey-title">Merci pour votre réponse.</h2>
          <p class="survey-sub">Les profils correspondants seront recontactés par WhatsApp dans les prochaines semaines pour la suite du programme.</p>
          <a data-router class="btn btn-secondary" href="/">Retour à La Forge Hub</a>
        </div>
      </div>
    </div>`;
}

function wireConditionals(container) {
  container.querySelectorAll('[data-when]').forEach((node) => {
    const [field, valuesStr] = node.dataset.when.split('=');
    const values = valuesStr.split('|');
    const inputs = container.querySelectorAll(`[name="${field}"]`);
    function sync() {
      const checkedVals = Array.from(inputs)
        .filter((i) => i.checked)
        .map((i) => i.value);
      const show = checkedVals.some((v) => values.includes(v));
      node.hidden = !show;
    }
    inputs.forEach((i) => i.addEventListener('change', sync));
    sync();
  });
}

export function bindSurveyPage() {
  const hero = document.getElementById('surveyHero');
  const wizard = document.getElementById('surveyWizard');
  const doneEl = document.getElementById('surveyDone');
  const stepBody = document.getElementById('surveyStepBody');
  const progressBar = document.getElementById('surveyProgressBar');
  const stepLabel = document.getElementById('surveyStepLabel');
  const prevBtn = document.getElementById('surveyPrevBtn');
  const nextBtn = document.getElementById('surveyNextBtn');
  if (!hero || !wizard || !stepBody) return;

  let step = 1;
  let answers = initialAnswers();

  function renderStep() {
    stepBody.innerHTML = STEPS[step - 1].render(answers);
    stepLabel.textContent = `Étape ${step} sur 8`;
    progressBar.style.width = `${(step / FORM_STEPS) * 100}%`;
    prevBtn.hidden = step === 1;
    nextBtn.textContent = step === FORM_STEPS ? 'Envoyer ma réponse' : 'Suivant';
    wireConditionals(stepBody);
  }

  function showError(msg) {
    const el = stepBody.querySelector('[data-error]');
    if (el) el.textContent = msg;
  }

  document.getElementById('surveyStartBtn')?.addEventListener('click', () => {
    hero.hidden = true;
    wizard.hidden = false;
    renderStep();
    wizard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  prevBtn?.addEventListener('click', () => {
    if (step > 1) {
      step -= 1;
      renderStep();
    }
  });

  nextBtn?.addEventListener('click', async () => {
    const result = STEPS[step - 1].validate(stepBody, answers);
    if (!result.ok) {
      showError(result.error);
      return;
    }
    const { website, ...patch } = result.patch || {};
    answers = { ...answers, ...patch };

    if (step < FORM_STEPS) {
      step += 1;
      renderStep();
      return;
    }

    if (website) {
      wizard.hidden = true;
      doneEl.hidden = false;
      return;
    }

    nextBtn.disabled = true;
    prevBtn.disabled = true;
    nextBtn.textContent = 'Envoi en cours…';
    try {
      const res = await fetch('/api/survey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...buildPayload(answers), website }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Envoi impossible.');
      wizard.hidden = true;
      doneEl.hidden = false;
      doneEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      showError(err.message || 'Connexion impossible. Vérifiez votre réseau et réessayez.');
      nextBtn.disabled = false;
      prevBtn.disabled = false;
      nextBtn.textContent = 'Envoyer ma réponse';
    }
  });
}
