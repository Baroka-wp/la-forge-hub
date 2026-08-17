/**
 * Page publique non listée : /attestations
 * Diffusion des attestations de participation NOAI 2026 et Bootcamp de préparation IOAI 2026.
 *
 * Trois étapes dans une seule page (pas de changement d'URL) :
 *   intro → formulaire → résultats (aperçu + téléchargement)
 */

const SUPPORT_EMAIL = 'birotori@gmail.com';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function supportMailto(context = '') {
  const subject = encodeURIComponent('Attestation NOAI 2026 — demande d’assistance');
  const body = encodeURIComponent(
    [
      'Bonjour,',
      '',
      "Je n'arrive pas à récupérer mon attestation de participation.",
      '',
      `Numéro de table : ${context || '…'}`,
      'Nom et prénom(s) : ',
      'Téléphone : ',
      '',
      'Merci de votre aide.',
    ].join('\n'),
  );
  return `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
}

const BANNER = `
  <div class="noai-banner">
    <img src="/noai-banner.png" alt="Olympiades Nationales d'Intelligence Artificielle" />
  </div>`;

function pageFrame(inner) {
  return `
    <div class="noai-page">
      <div class="noai-sheet">
        ${BANNER}
        ${inner}
      </div>
      <p class="noai-back"><a href="/" data-router>Retour à La Forge Hub</a></p>
    </div>`;
}

function introHtml() {
  return `
    <div class="noai-body" id="noaiStepIntro">
      <h1 class="noai-title">Attestation de participation</h1>
      <div class="noai-rule" aria-hidden="true"></div>
      <p class="noai-lead">
        Cet espace permet aux participants des Olympiades Nationales d’Intelligence
        Artificielle 2026 de récupérer leur attestation officielle.
      </p>
      <p class="noai-note">
        Les lauréats ayant suivi le bootcamp de préparation aux Olympiades Internationales
        y retrouveront également leur seconde attestation.
      </p>
      <div class="noai-actions">
        <button type="button" class="noai-btn noai-btn-primary" id="noaiStartBtn">
          Demander mon attestation
        </button>
      </div>
      <p class="noai-help">
        Un problème ?
        <a href="${supportMailto()}">Écrire à l’administrateur</a>
      </p>
    </div>`;
}

function formHtml(prefill = {}) {
  return `
    <div class="noai-body" id="noaiStepForm">
      <h1 class="noai-title">Demande d’attestation</h1>
      <div class="noai-rule" aria-hidden="true"></div>
      <p class="noai-lead">Renseignez vos informations. Tous les champs sont obligatoires.</p>

      <form id="noaiForm" class="noai-form" novalidate>
        <label class="noai-field">
          <span>Numéro de table</span>
          <input type="text" name="tableNumber" inputmode="text" autocomplete="off"
            placeholder="Ex. NOAI_26_XXX" value="${escapeHtml(prefill.tableNumber || '')}" required />
          <small>Figure sur votre convocation et sur votre poste le jour de la compétition.</small>
        </label>

        <label class="noai-field">
          <span>Nom et prénom(s)</span>
          <input type="text" name="fullName" autocomplete="name"
            placeholder="Votre nom complet" value="${escapeHtml(prefill.fullName || '')}" required />
        </label>

        <label class="noai-field">
          <span>Adresse e-mail</span>
          <input type="email" name="email" autocomplete="email"
            placeholder="vous@exemple.com" value="${escapeHtml(prefill.email || '')}" required />
        </label>

        <label class="noai-field">
          <span>Numéro de téléphone</span>
          <input type="tel" name="phone" autocomplete="tel"
            placeholder="+229 01 97 00 00 00" value="${escapeHtml(prefill.phone || '')}" required />
        </label>

        <p class="noai-message" id="noaiMessage" role="alert" aria-live="polite"></p>

        <button type="submit" class="noai-btn noai-btn-primary noai-btn-block" id="noaiSubmit">
          Rechercher mon attestation
        </button>
      </form>

      <p class="noai-help">
        Vous ne retrouvez pas votre numéro de table ?
        <a href="${supportMailto()}" id="noaiHelpLink">Écrire à l’administrateur</a>
      </p>
    </div>`;
}

function certificateCardHtml(certificate, token) {
  const preview = `/api/attestations/file?mode=preview&id=${encodeURIComponent(certificate.id)}&token=${encodeURIComponent(token)}`;
  const download = `/api/attestations/file?mode=download&id=${encodeURIComponent(certificate.id)}&token=${encodeURIComponent(token)}`;
  return `
    <article class="noai-cert">
      <h2 class="noai-cert-title">${escapeHtml(certificate.label)}</h2>
      <div class="noai-cert-preview">
        <img src="${preview}" alt="Aperçu de ${escapeHtml(certificate.label)}" loading="lazy" />
      </div>
      <div class="noai-cert-actions">
        <a class="noai-btn noai-btn-primary" href="${download}" data-download-id="${escapeHtml(certificate.id)}">
          Télécharger le PDF
        </a>
        <a class="noai-btn noai-btn-ghost" href="${preview.replace('mode=preview', 'mode=inline')}" target="_blank" rel="noopener">
          Ouvrir en plein écran
        </a>
      </div>
    </article>`;
}

function resultHtml(data) {
  const cards = data.certificates.map((c) => certificateCardHtml(c, data.token)).join('');
  const plural = data.certificates.length > 1 ? 's' : '';
  return `
    <div class="noai-body" id="noaiStepResult">
      <h1 class="noai-title">Attestation${plural} disponible${plural}</h1>
      <div class="noai-rule" aria-hidden="true"></div>
      <p class="noai-lead">
        Délivrée${plural} à <strong>${escapeHtml(data.holder.fullName)}</strong>,
        table ${escapeHtml(data.holder.tableNumber)}.
      </p>
      <div class="noai-cert-list">${cards}</div>
      <p class="noai-note noai-note-timer">
        Les liens de téléchargement restent actifs 30 minutes. Passé ce délai, relancez la recherche.
      </p>
      <div class="noai-actions">
        <button type="button" class="noai-btn noai-btn-ghost" id="noaiRestartBtn">Nouvelle recherche</button>
      </div>
      <p class="noai-help">
        Une erreur sur votre attestation ?
        <a href="${supportMailto(data.holder.tableNumber)}">Écrire à l’administrateur</a>
      </p>
    </div>`;
}

export function renderAttestationsPageHtml() {
  return pageFrame(introHtml());
}

export function bindAttestationsPage() {
  const sheet = document.querySelector('.noai-sheet');
  if (!sheet) return;

  function mount(html) {
    const body = sheet.querySelector('.noai-body');
    if (body) body.remove();
    sheet.insertAdjacentHTML('beforeend', html);
    sheet.scrollIntoView({ block: 'start', behavior: 'smooth' });
    wire();
  }

  function wire() {
    const startBtn = document.getElementById('noaiStartBtn');
    if (startBtn) startBtn.addEventListener('click', () => mount(formHtml()));

    const restartBtn = document.getElementById('noaiRestartBtn');
    if (restartBtn) restartBtn.addEventListener('click', () => mount(formHtml()));

    const form = document.getElementById('noaiForm');
    if (form) bindForm(form);

    document.querySelectorAll('[data-download-id]').forEach((link) => {
      link.addEventListener('click', () => {
        link.classList.add('is-downloading');
        setTimeout(() => link.classList.remove('is-downloading'), 2500);
      });
    });
  }

  function bindForm(form) {
    const message = document.getElementById('noaiMessage');
    const submit = document.getElementById('noaiSubmit');

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      message.textContent = '';
      message.className = 'noai-message';

      const data = Object.fromEntries(new FormData(form).entries());
      const payload = {
        tableNumber: String(data.tableNumber || '').trim(),
        fullName: String(data.fullName || '').trim(),
        email: String(data.email || '').trim(),
        phone: String(data.phone || '').trim(),
      };

      const missing = Object.entries(payload).filter(([, v]) => !v);
      if (missing.length) {
        message.textContent = 'Merci de renseigner tous les champs.';
        message.classList.add('is-error');
        return;
      }

      submit.disabled = true;
      submit.textContent = 'Vérification en cours…';

      try {
        const res = await fetch('/api/attestations/lookup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const body = await res.json().catch(() => ({}));

        if (res.ok && body.found) {
          mount(resultHtml(body));
          return;
        }

        message.textContent = body.error || 'Vérification impossible. Réessayez.';
        message.classList.add('is-error');
        const help = document.getElementById('noaiHelpLink');
        if (help) help.setAttribute('href', supportMailto(payload.tableNumber));
      } catch {
        message.textContent = 'Connexion impossible. Vérifiez votre réseau et réessayez.';
        message.classList.add('is-error');
      } finally {
        submit.disabled = false;
        submit.textContent = 'Rechercher mon attestation';
      }
    });
  }

  wire();
}
