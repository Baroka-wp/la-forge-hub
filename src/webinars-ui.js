import {
  backendMode,
  fetchWebinars,
  fetchWebinarById,
  fetchNextWebinarEvent,
  registerForWebinar,
  subscribeToReplay,
  trackReplayView,
  getSession,
} from './api.js';

function esc(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const GUEST_WEBINAR_REG_PREFIX = 'instii_webinar_guest_';

function guestWebinarStorageKey(webinarId) {
  return `${GUEST_WEBINAR_REG_PREFIX}${webinarId}`;
}

export function readGuestWebinarRegisteredEmail(webinarId) {
  try {
    const raw = sessionStorage.getItem(guestWebinarStorageKey(webinarId));
    if (!raw) return null;
    const o = JSON.parse(raw);
    return typeof o?.email === 'string' ? o.email : null;
  } catch {
    return null;
  }
}

function writeGuestWebinarRegistration(webinarId, email) {
  sessionStorage.setItem(
    guestWebinarStorageKey(webinarId),
    JSON.stringify({ email: email.trim().toLowerCase() }),
  );
}

/** YouTube uniquement (domaines officiels) — évite les faux positifs sur d’autres liens. */
function youtubeEmbedSrc(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    const parsed = new URL(url.trim());
    const host = parsed.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') {
      const id = parsed.pathname.replace(/^\//, '').split(/[?&#]/)[0];
      if (id && /^[a-zA-Z0-9_-]{6,}$/.test(id)) return `https://www.youtube.com/embed/${id}`;
      return null;
    }
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      const v = parsed.searchParams.get('v');
      if (v && /^[a-zA-Z0-9_-]{6,}$/.test(v)) return `https://www.youtube.com/embed/${v}`;
      const embed = parsed.pathname.match(/\/embed\/([a-zA-Z0-9_-]{6,})/);
      if (embed) return `https://www.youtube.com/embed/${embed[1]}`;
    }
  } catch {
    return null;
  }
  return null;
}

/** Google Drive : fichier vidéo → URL /preview pour iframe (lien « partager » ou /file/d/ID/…). */
function driveEmbedSrc(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    const parsed = new URL(url.trim());
    const host = parsed.hostname.replace(/^www\./, '');
    if (host !== 'drive.google.com') return null;
    const fileMatch = parsed.pathname.match(/\/file\/d\/([^/]+)/);
    if (fileMatch?.[1]) {
      return `https://drive.google.com/file/d/${fileMatch[1]}/preview`;
    }
    if (parsed.pathname === '/open' || parsed.pathname === '/open/') {
      const id = parsed.searchParams.get('id');
      if (id) return `https://drive.google.com/file/d/${id}/preview`;
    }
  } catch {
    return null;
  }
  return null;
}

/** Dossier Google Drive : vue intégrée (liste des fichiers du dossier). */
function driveFolderEmbedSrc(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    const parsed = new URL(url.trim());
    const host = parsed.hostname.replace(/^www\./, '');
    if (host !== 'drive.google.com') return null;
    const folderMatch = parsed.pathname.match(/\/folders\/([^/?]+)/);
    if (folderMatch?.[1]) {
      return `https://drive.google.com/embeddedfolderview?id=${folderMatch[1]}`;
    }
  } catch {
    return null;
  }
  return null;
}

function recordingEmbedSrc(url) {
  return youtubeEmbedSrc(url) || driveEmbedSrc(url) || driveFolderEmbedSrc(url);
}

function locLabel(locationType, venue) {
  if (locationType === 'ONLINE') return 'En ligne';
  if (locationType === 'ONSITE') return venue ? `Présentiel · ${esc(venue)}` : 'Présentiel';
  return '';
}

/** Replay disponible (lien renseigné ou ancien enregistrement ARCHIVE). */
function hasPublicReplay(w) {
  return w.lifecycle === 'REPLAY_READY' || !!(w.recordingUrl && String(w.recordingUrl).trim()) || w.kind === 'ARCHIVE';
}

function isUpcoming(w) {
  if (w.lifecycle) return w.lifecycle === 'UPCOMING';
  if (w.kind !== 'EVENT' || !w.startsAt) return false;
  return new Date(w.startsAt) > new Date() && !hasPublicReplay(w);
}

function webinarPageAbsoluteUrl(w) {
  const base =
    typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '';
  return `${base}/webinars/${encodeURIComponent(w.id)}`;
}

function formatIcsUtc(d) {
  return d
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}

function icsEscape(s) {
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function webinarIcsMetaB64(w, pageUrl) {
  try {
    const payload = JSON.stringify({
      id: w.id,
      title: w.title,
      description: String(w.description || '').slice(0, 2500),
      startsAt: w.startsAt,
      locationType: w.locationType,
      venue: w.venue || '',
      onlineLink: w.onlineLink || '',
      pageUrl,
    });
    return btoa(unescape(encodeURIComponent(payload)));
  } catch {
    return '';
  }
}

function buildWebinarIcsPayloadFromMeta(o) {
  if (!o || !o.startsAt) return '';
  const w = o;
  const pageUrl = o.pageUrl || '';
  const start = new Date(w.startsAt);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  const loc =
    w.locationType === 'ONLINE'
      ? pageUrl
      : [w.venue, w.onlineLink].filter(Boolean).join(' · ') || pageUrl;
  const desc = `${String(w.description || '').slice(0, 1800)}\n\nPage : ${pageUrl}`;
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//La Forge Hub//Webinar//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${w.id}@forge-hub`,
    `DTSTAMP:${formatIcsUtc(new Date())}`,
    `DTSTART:${formatIcsUtc(start)}`,
    `DTEND:${formatIcsUtc(end)}`,
    `SUMMARY:${icsEscape(w.title)}`,
    `DESCRIPTION:${icsEscape(desc)}`,
    `LOCATION:${icsEscape(loc)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

function googleCalendarUrl(w, pageUrl) {
  if (!w.startsAt) return '#';
  const start = new Date(w.startsAt);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  const details = `${String(w.description || '').slice(0, 1500)}\n\n${pageUrl}`;
  const location =
    w.locationType === 'ONLINE'
      ? pageUrl
      : [w.venue, w.onlineLink].filter(Boolean).join(' · ') || pageUrl;
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: w.title,
    dates: `${formatIcsUtc(start)}/${formatIcsUtc(end)}`,
    details,
    location,
  });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

function webinarRegisteredPackHtml(w, pageUrl) {
  const gcal = googleCalendarUrl(w, pageUrl);
  const hasJoin = w.locationType === 'ONLINE';
  const joinSection = hasJoin
    ? w.onlineLink
      ? `
      <div class="webinar-toolkit webinar-toolkit--block" data-webinar-toolkit="1">
        <p class="eyebrow webinar-toolkit-kicker">Connexion en ligne</p>
        <label class="webinar-toolkit-label" for="webinarJoinUrlField">Lien de la session (copier pour rejoindre)</label>
        <div class="webinar-toolkit-copyrow">
          <input type="text" readonly class="webinar-toolkit-input" id="webinarJoinUrlField" value="${esc(
        w.onlineLink,
      )}" />
          <button type="button" class="btn btn-secondary btn-sm" id="btnWebinarCopyJoin">Copier</button>
        </div>
      </div>`
      : `<p class="muted small webinar-join-pending">Le lien de visioconférence sera communiqué par e-mail ou affiché ici dès qu’il sera disponible.</p>`
    : `
      <div class="webinar-toolkit webinar-toolkit--block">
        <p class="eyebrow webinar-toolkit-kicker">Lieu</p>
        <p class="body-sm">${esc(w.venue || 'L’adresse précise vous sera communiquée par e-mail.')}</p>
      </div>`;

  const metaB64 = webinarIcsMetaB64(w, pageUrl);
  const metaAttr = metaB64 ? ` data-ics-meta="${String(metaB64).replace(/"/g, '&quot;')}"` : '';
  return `
    <div class="webinar-registered-pack"${metaAttr}>
      <p class="webinar-registered-badge">Vous êtes inscrit·e à cette session.</p>
      ${joinSection}
      <div class="webinar-toolkit webinar-toolkit--row-block">
        <p class="eyebrow webinar-toolkit-kicker">Calendrier</p>
        <div class="webinar-toolkit-row">
          <a class="btn btn-secondary btn-sm" href="${esc(gcal)}" target="_blank" rel="noopener noreferrer">Google&nbsp;Agenda</a>
          <button type="button" class="btn btn-secondary btn-sm" id="btnWebinarDownloadIcs">Fichier&nbsp;.ics</button>
        </div>
      </div>
      <div class="webinar-toolkit webinar-toolkit--row-block">
        <p class="eyebrow webinar-toolkit-kicker">Partager le webinaire</p>
        <div class="webinar-toolkit-row">
          <button type="button" class="btn btn-secondary btn-sm" id="btnWebinarSharePage">Partager ou copier le lien</button>
        </div>
        <input type="hidden" id="webinarShareUrlValue" value="${esc(pageUrl)}" />
      </div>
    </div>`;
}

function parseIcsMetaFromPack(packEl) {
  const b64 = packEl?.getAttribute('data-ics-meta');
  if (!b64) return null;
  try {
    const j = decodeURIComponent(escape(atob(b64)));
    return JSON.parse(j);
  } catch {
    return null;
  }
}

/**
 * Encart « prochain webinaire » pour le tableau de bord apprenant.
 */
export async function getDashboardWebinarBannerHtml() {
  if (backendMode() !== 'neon') return '';
  const r = await fetchNextWebinarEvent();
  if (!r.ok || !r.webinar) return '';
  const w = r.webinar;
  const when = w.startsAt
    ? new Date(w.startsAt).toLocaleString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    })
    : '';
  const registered = !!w.registered;
  const banner = w.bannerUrl
    ? `<div class="webinar-dash-banner-img"><img src="${esc(w.bannerUrl)}" alt="" loading="lazy" /></div>`
    : '';
  return `
    <div class="webinar-dash-banner surface-container-low">
      ${banner}
      <div class="webinar-dash-banner-body">
        <p class="eyebrow">Prochain webinaire</p>
        <h2 class="h3">${esc(w.title)}</h2>
        <p class="muted webinar-dash-meta">${when ? esc(when) : ''} · ${locLabel(w.locationType, w.venue)}</p>
        <p class="body-sm">${esc(w.description).slice(0, 220)}${w.description.length > 220 ? '…' : ''}</p>
        <div class="webinar-dash-actions webinar-dash-actions--register">
          <a data-router class="btn btn-primary" href="/webinars/${esc(w.id)}">Détails & inscription</a>
          ${registered
      ? '<span class="webinar-registered-badge">Inscrit·e</span>'
      : `<div class="webinar-dash-register-inline webinar-dash-register-inline--stack">
              <label class="webinar-marketing-opt webinar-marketing-opt--compact webinar-terms-opt">
                <input type="checkbox" id="acceptTermsDashWebinar" />
                <span>J’accepte les <a data-router href="/cgu" class="inline-legal-link">CGU</a></span>
              </label>
              <label class="webinar-marketing-opt webinar-marketing-opt--compact">
                <input type="checkbox" id="dashWebinarMarketingOptIn" />
                <span>E-mails La Forge Hub</span>
              </label>
              <button type="button" class="btn btn-secondary" id="btnDashWebinarRegister" data-webinar-id="${esc(w.id)}" disabled aria-disabled="true">Je m’inscris</button>
            </div>`
    }
        </div>
      </div>
    </div>`;
}

export function bindDashboardWebinarBanner() {
  const btn = document.getElementById('btnDashWebinarRegister');
  if (!btn) return;
  const id = btn.getAttribute('data-webinar-id');
  if (!id) return;
  const termsCb = document.getElementById('acceptTermsDashWebinar');
  function syncDashBtn() {
    const ok = termsCb instanceof HTMLInputElement && termsCb.checked;
    btn.disabled = !ok;
    btn.setAttribute('aria-disabled', ok ? 'false' : 'true');
  }
  termsCb?.addEventListener('change', syncDashBtn);
  syncDashBtn();
  btn.addEventListener('click', async () => {
    if (termsCb instanceof HTMLInputElement && !termsCb.checked) return;
    const opt = document.getElementById('dashWebinarMarketingOptIn');
    const marketingOptIn = opt instanceof HTMLInputElement && opt.checked;
    const r = await registerForWebinar(id, { marketingOptIn });
    if (!r.ok) {
      alert(r.error || 'Erreur');
      return;
    }
    const wrap = btn.closest('.webinar-dash-register-inline');
    if (wrap) wrap.replaceWith('<span class="webinar-registered-badge">Inscrit·e</span>');
    else btn.replaceWith('<span class="webinar-registered-badge">Inscrit·e</span>');
  });
}

export async function renderWebinarsPageHtml() {
  const neon = backendMode() === 'neon';
  if (!neon) {
    return `
      <section class="panel surface-card">
        <h1 class="h1">Webinaires</h1>
        <div class="webinar-neon-required" role="status">
          <p><strong>Mode navigateur seul</strong> : la liste « magazine », les replays et l’admin webinaires passent par l’API.</p>
          <p class="muted">Dans <code>.env</code>, mettez <code>VITE_USE_NEON_API=true</code>, puis <strong>redémarrez</strong> <code>npm run dev</code> (Vite ne recharge pas toujours les variables d’environnement à chaud).</p>
        </div>
      </section>`;
  }

  const all = await fetchWebinars();
  if (!all.ok) {
    return `
      <section class="panel surface-card">
        <h1 class="h1">Webinaires</h1>
        <p class="form-error">${esc(all.error || 'Erreur de chargement')}</p>
      </section>`;
  }

  const upcoming = all.webinars.filter((w) => isUpcoming(w));
  const archives = all.webinars.filter((w) => hasPublicReplay(w));

  const card = (w) => {
    const meta = hasPublicReplay(w)
      ? 'Replay'
      : w.kind === 'EVENT' && w.startsAt
        ? new Date(w.startsAt).toLocaleString('fr-FR', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
        : '';
    const thumb = w.bannerUrl
      ? `<div class="webinar-card-thumb"><img src="${esc(w.bannerUrl)}" alt="" loading="lazy" /></div>`
      : `<div class="webinar-card-thumb webinar-card-thumb--placeholder"></div>`;
    return `
      <article class="webinar-card surface-container-low ${hasPublicReplay(w) ? 'is-replay' : 'is-upcoming'}">
        <a data-router href="/webinars/${esc(w.id)}" class="webinar-card-link">
          ${thumb}
          <div class="webinar-card-body">
            <span class="webinar-card-tag">${esc(w.tag)}</span>
            <h2 class="webinar-card-title">${esc(w.title)}</h2>
            <p class="muted webinar-card-desc">${esc(w.description).slice(0, 140)}${w.description.length > 140 ? '…' : ''}</p>
            <span class="webinar-card-meta">${esc(meta)}</span>
          </div>
        </a>
      </article>`;
  };

  const hero = upcoming[0];
  const heroWhen = hero?.startsAt
    ? new Date(hero.startsAt).toLocaleString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    })
    : '';
  const heroMedia = hero?.bannerUrl
    ? `<img src="${esc(hero.bannerUrl)}" alt="" loading="lazy" />`
    : '<div class="webinar-hero-placeholder"></div>';

  return `
    <div class="webinars-page-layout">
      <section class="webinars-page webinar-editorial panel surface-card">
        <header class="webinar-editorial-head">
          <p class="eyebrow">Edition webinaires</p>
          <h1 class="h1">Webinaires</h1>
          <p class="muted body-lg">Sessions a venir et replays de formation, presentes dans un format editorial clair.</p>
        </header>

        ${hero
      ? `<article class="webinar-hero surface-container-low">
              <a data-router href="/webinars/${esc(hero.id)}" class="webinar-hero-media">${heroMedia}</a>
              <div class="webinar-hero-body">
                <p class="webinar-hero-kicker">A venir</p>
                <h2 class="h2"><a data-router href="/webinars/${esc(hero.id)}">${esc(hero.title)}</a></h2>
                <p class="muted webinar-hero-meta">${esc(heroWhen)} · ${locLabel(hero.locationType, hero.venue)}</p>
                <p class="body-md">${esc(hero.description).slice(0, 260)}${hero.description.length > 260 ? '…' : ''}</p>
                <div class="webinar-hero-actions">
                  <a data-router class="btn btn-primary" href="/webinars/${esc(hero.id)}">Voir le programme</a>
                </div>
              </div>
            </article>`
      : ''
    }

        <h2 class="h2 section-title">A venir</h2>
        <div class="webinar-grid">
          ${upcoming.length ? upcoming.map(card).join('') : '<p class="muted">Aucun webinaire a venir pour l’instant.</p>'}
        </div>

        <h2 class="h2 section-title">Replays</h2>
        <div class="webinar-grid">
          ${archives.length ? archives.map(card).join('') : '<p class="muted">Aucun replay publie pour l’instant.</p>'}
        </div>
      </section>
    </div>`;
}

function replayRailItemHtml(x) {
  const when = x.startsAt
    ? new Date(x.startsAt).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
    : '';
  const thumb = x.bannerUrl
    ? `<div class="webinar-replays-rail-thumb"><img src="${esc(x.bannerUrl)}" alt="" loading="lazy" /></div>`
    : `<div class="webinar-replays-rail-thumb webinar-replays-rail-thumb--placeholder"></div>`;
  return `
    <a data-router href="/webinars/${esc(x.id)}" class="webinar-replays-rail-item">
      ${thumb}
      <div class="webinar-replays-rail-item-text">
        <span class="webinar-replays-rail-item-title">${esc(x.title)}</span>
        ${when ? `<span class="webinar-replays-rail-meta muted small">${esc(when)}</span>` : ''}
      </div>
    </a>`;
}

/**
 * @param {string} id
 * @param {{ r?: import('./api.js').fetchWebinarById extends (...args: infer A) => infer R ? Awaited<R> : never; allList?: Awaited<ReturnType<typeof fetchWebinars>> } | null} [preloaded] — évite un double fetch quand les données viennent déjà du routeur.
 */
export async function renderWebinarDetailHtml(id, preloaded = null) {
  const neon = backendMode() === 'neon';
  if (!neon) {
    return `
      <section class="panel surface-card">
        <p class="muted">Webinaires indisponibles en mode local.</p>
        <a data-router href="/webinars">Retour</a>
      </section>`;
  }

  let r;
  let allList;
  if (preloaded && preloaded.r !== undefined && preloaded.allList !== undefined) {
    r = preloaded.r;
    allList = preloaded.allList;
  } else {
    const guestEmailForApi = readGuestWebinarRegisteredEmail(id) || '';
    const results = await Promise.all([
      fetchWebinarById(id, { guestEmail: guestEmailForApi }),
      fetchWebinars(),
    ]);
    r = results[0];
    allList = results[1];
  }
  if (!r.ok || !r.webinar) {
    return `
      <section class="panel surface-card">
        <h1 class="h1">Introuvable</h1>
        <p class="muted">${esc(r.error || 'Ce webinaire n’existe pas ou n’est plus en ligne.')}</p>
        <a data-router class="btn btn-secondary" href="/webinars">Liste des webinaires</a>
      </section>`;
  }

  const w = r.webinar;
  const otherReplays = allList.ok
    ? allList.webinars.filter((x) => x.id !== w.id && hasPublicReplay(x))
    : [];
  otherReplays.sort((a, b) => {
    const ta = a.startsAt ? new Date(a.startsAt).getTime() : 0;
    const tb = b.startsAt ? new Date(b.startsAt).getTime() : 0;
    return tb - ta;
  });
  const { user } = await getSession();
  /** Statut d’inscription : API (JWT + regEmail invité). */
  const registered = !!w.registered;
  const isPastEvent = w.kind === 'EVENT' && w.startsAt && new Date(w.startsAt) <= new Date();
  const canRegister = isUpcoming(w) && w.startsAt && new Date(w.startsAt) > new Date();

  const recUrl = w.recordingUrl && String(w.recordingUrl).trim();
  const emb = recUrl ? recordingEmbedSrc(recUrl) : null;
  if (emb) {
    void trackReplayView(w.id).catch(() => {});
  }

  const iframeAttrs = emb
    ? `
            <iframe
              src="${esc(emb)}"
              title="Replay"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
              allowfullscreen
              loading="lazy"
              referrerpolicy="strict-origin-when-cross-origin"
            ></iframe>`
    : '';

  const isFolderEmbed = Boolean(emb && emb.includes('embeddedfolderview'));

  let bannerTop = '';
  if (emb) {
    const embedWrap = isFolderEmbed
      ? `<div class="webinar-embed webinar-embed--drive-folder">${iframeAttrs}</div>`
      : `<div class="webinar-embed ratio-16-9">${iframeAttrs}</div>`;
    bannerTop = `
      <div class="webinar-detail-banner webinar-detail-banner--replay ${isFolderEmbed ? 'webinar-detail-banner--folder' : ''}">
        ${embedWrap}
      </div>`;
  } else if (w.bannerUrl && !recUrl) {
    bannerTop = `<div class="webinar-detail-banner"><img src="${esc(w.bannerUrl)}" alt="" /></div>`;
  }

  const when =
    w.startsAt &&
    new Date(w.startsAt).toLocaleString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  const pageUrl = webinarPageAbsoluteUrl(w);

  const regUi =
    canRegister && !registered
      ? user
        ? `<div class="webinar-register-stack">
            <label class="webinar-marketing-opt webinar-terms-opt">
              <input type="checkbox" id="acceptTermsWebinar" />
              <span>J’ai lu et j’accepte les <a data-router href="/cgu" class="inline-legal-link">conditions générales d’utilisation</a> de La Forge Hub.</span>
            </label>
            <label class="webinar-marketing-opt">
              <input type="checkbox" id="webinarMarketingOptIn" />
              <span>J’accepte de recevoir des e-mails pour les annonces des prochaines activités de La Forge Hub.</span>
            </label>
            <button type="button" class="btn btn-primary" id="btnWebinarRegister" data-webinar-id="${esc(w.id)}" disabled aria-disabled="true">M’inscrire à ce webinaire</button>
          </div>`
        : `<form id="formWebinarGuestRegister" class="webinar-guest-register" data-webinar-id="${esc(w.id)}">
            <label class="webinar-guest-register-label"><span class="admin-label-text">E-mail</span><input type="email" name="email" required autocomplete="email" placeholder="vous@exemple.com" /></label>
            <label class="webinar-guest-register-label"><span class="admin-label-text">Nom complet</span><input type="text" name="fullName" required autocomplete="name" placeholder="Prénom et nom" /></label>
            <label class="webinar-guest-register-label"><span class="admin-label-text">WhatsApp</span><input type="tel" name="phone" inputmode="tel" required autocomplete="tel" placeholder="+33 6 12 34 56 78" /></label>
            <label class="webinar-marketing-opt webinar-marketing-opt--guest webinar-terms-opt">
              <input type="checkbox" name="acceptTerms" id="acceptTermsWebinarGuest" />
              <span>J’ai lu et j’accepte les <a data-router href="/cgu" class="inline-legal-link">conditions générales d’utilisation</a> de La Forge Hub.</span>
            </label>
            <label class="webinar-marketing-opt webinar-marketing-opt--guest">
              <input type="checkbox" name="marketingOptIn" id="webinarGuestMarketingOptIn" />
              <span>J’accepte de recevoir des e-mails pour les annonces des prochaines activités de La Forge Hub.</span>
            </label>
            <button type="submit" class="btn btn-primary" id="btnWebinarGuestSubmit" disabled aria-disabled="true">M’inscrire à ce webinaire</button>
            <p id="webinarGuestRegisterMsg" class="form-error admin-msg" role="status"></p>
          </form>`
      : '';

  const teaserOnline =
    canRegister && !registered && w.kind === 'EVENT' && w.locationType === 'ONLINE'
      ? `<p class="muted small webinar-side-teaser">Après inscription, ce bloc affiche le <strong>lien de connexion</strong> (copie), l’ajout au <strong>calendrier</strong> et le <strong>partage</strong></p>`
      : '';

  const registeredPackHtml = canRegister && registered ? webinarRegisteredPackHtml(w, pageUrl) : '';

  const pastReplayMsg =
    w.kind === 'EVENT' && isPastEvent && !hasPublicReplay(w)
      ? '<p class="muted">Ce webinaire est terminé. Ajoutez le lien du replay depuis l’administration lorsqu’il est disponible.</p>'
      : '';

  const hasSide = Boolean(teaserOnline || regUi || registeredPackHtml || pastReplayMsg);

  const replayOptinHtml =
    hasPublicReplay(w)
      ? `<section class="webinar-replay-optin surface-container-low">
          <h2 class="h3">Recevoir les prochains webinaires</h2>
          <p class="muted body-sm">Renseignez vos coordonnées pour être averti·e dès qu’un nouveau webinaire ou replay est publié.</p>
          <form id="formReplayOptin" class="webinar-replay-optin-form" data-webinar-id="${esc(w.id)}">
            <label class="webinar-replay-optin-label"><span class="admin-label-text">Prénom</span><input type="text" name="firstName" required autocomplete="given-name" placeholder="Votre prénom" /></label>
            <label class="webinar-replay-optin-label"><span class="admin-label-text">Nom</span><input type="text" name="lastName" required autocomplete="family-name" placeholder="Votre nom" /></label>
            <label class="webinar-replay-optin-label"><span class="admin-label-text">Téléphone</span><input type="tel" name="phone" required autocomplete="tel" inputmode="tel" placeholder="+33 6 12 34 56 78" /></label>
            <label class="webinar-replay-optin-label"><span class="admin-label-text">E-mail</span><input type="email" name="email" required autocomplete="email" placeholder="vous@exemple.com" /></label>
            <button type="submit" class="btn btn-secondary">Recevoir les alertes</button>
            <p id="replayOptinMsg" class="form-error admin-msg" role="status"></p>
            <p class="muted small">En soumettant ce formulaire, vous acceptez de recevoir les annonces de La Forge Hub. Vous pourrez vous désabonner à tout moment.</p>
          </form>
        </section>`
      : '';

  const replaysRail = `
    <aside class="webinar-detail-replays-rail surface-container-low" aria-label="Autres replays">
      <h2 class="webinar-replays-rail-heading">Autres replays</h2>
      <div class="webinar-replays-rail-list">
        ${otherReplays.length
      ? otherReplays.map(replayRailItemHtml).join('')
      : '<p class="muted small webinar-replays-rail-empty">Aucun autre replay pour l’instant.</p>'
    }
      </div>
      <p class="webinar-replays-rail-all muted small">
        <a data-router href="/webinars">Voir tous les webinaires →</a>
      </p>
    </aside>`;

  return `
    <div class="webinar-detail-layout">
      <article class="panel surface-card webinar-detail webinar-detail-editorial webinar-detail--wide">
        <p class="webinar-detail-back webinar-detail-back--top"><a data-router href="/webinars">← Tous les webinaires</a></p>
        ${bannerTop}
        <div class="webinar-detail-shell">
          <header class="webinar-detail-head">
            <p class="eyebrow">${hasPublicReplay(w) ? 'Replay' : 'Webinaire'}</p>
            <h1 class="h1">${esc(w.title)}</h1>
            <p class="webinar-detail-tag">${esc(w.tag)}</p>
            ${when ? `<p class="muted webinar-detail-when">${esc(when)} · ${locLabel(w.locationType, w.venue)}</p>` : `<p class="muted">${locLabel(w.locationType, w.venue)}</p>`}
          </header>
          ${hasSide
      ? `<div class="webinar-detail-inline-side">
            ${teaserOnline}
            ${regUi ? `<div class="webinar-detail-actions">${regUi}</div>` : ''}
            ${registeredPackHtml}
            ${pastReplayMsg}
          </div>`
      : ''
    }
          <div class="webinar-detail-main">
            <div class="webinar-detail-desc body-lg"><p>${esc(w.description).replace(/\n/g, '<br/>')}</p></div>
            ${replayOptinHtml}
          </div>
        </div>
      </article>
      ${replaysRail}
    </div>`;
}

export function bindWebinarDetailPage() {
  const btn = document.getElementById('btnWebinarRegister');
  const termsLogged = document.getElementById('acceptTermsWebinar');
  if (btn && termsLogged) {
    function syncWebinarLoggedBtn() {
      const ok = termsLogged instanceof HTMLInputElement && termsLogged.checked;
      btn.disabled = !ok;
      btn.setAttribute('aria-disabled', ok ? 'false' : 'true');
    }
    termsLogged.addEventListener('change', syncWebinarLoggedBtn);
    syncWebinarLoggedBtn();
  }
  if (btn) {
    const wid = btn.getAttribute('data-webinar-id');
    if (wid) {
      btn.addEventListener('click', async () => {
        if (termsLogged instanceof HTMLInputElement && !termsLogged.checked) return;
        const opt = document.getElementById('webinarMarketingOptIn');
        const marketingOptIn = opt instanceof HTMLInputElement && opt.checked;
        const r = await registerForWebinar(wid, { marketingOptIn });
        if (!r.ok) {
          alert(r.error || 'Erreur');
          return;
        }
        window.location.reload();
      });
    }
  }

  const form = document.getElementById('formWebinarGuestRegister');
  if (form) {
    const wid = form.getAttribute('data-webinar-id');
    const msg = document.getElementById('webinarGuestRegisterMsg');
    const submitBtn = document.getElementById('btnWebinarGuestSubmit');
    const termsGuest = document.getElementById('acceptTermsWebinarGuest');
    function syncGuestSubmit() {
      if (!submitBtn || !(termsGuest instanceof HTMLInputElement)) return;
      const ok = termsGuest.checked;
      submitBtn.disabled = !ok;
      submitBtn.setAttribute('aria-disabled', ok ? 'false' : 'true');
    }
    termsGuest?.addEventListener('change', syncGuestSubmit);
    syncGuestSubmit();
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!wid) return;
      if (termsGuest instanceof HTMLInputElement && !termsGuest.checked) return;
      const fd = new FormData(form);
      const email = String(fd.get('email') || '').trim();
      const fullName = String(fd.get('fullName') || '').trim();
      const phone = String(fd.get('phone') || '').trim();
      const marketingOptIn = fd.get('marketingOptIn') === 'on';
      if (msg) msg.textContent = '';
      const r = await registerForWebinar(wid, { email, fullName, phone, marketingOptIn });
      if (!r.ok) {
        if (msg) msg.textContent = r.error || 'Erreur';
        return;
      }
      writeGuestWebinarRegistration(wid, email);
      window.location.reload();
    });
  }

  const replayForm = document.getElementById('formReplayOptin');
  if (replayForm) {
    const wid = replayForm.getAttribute('data-webinar-id');
    const msg = document.getElementById('replayOptinMsg');
    const submitBtn = replayForm.querySelector('button[type="submit"]');
    replayForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!wid) return;
      const fd = new FormData(replayForm);
      const email = String(fd.get('email') || '').trim();
      const firstName = String(fd.get('firstName') || '').trim();
      const lastName = String(fd.get('lastName') || '').trim();
      const phone = String(fd.get('phone') || '').trim();
      if (!firstName || !lastName || !phone || !email) {
        if (msg) msg.textContent = 'Merci de remplir prénom, nom, téléphone et e-mail.';
        return;
      }
      if (msg) msg.textContent = '';
      submitBtn?.setAttribute('disabled', 'true');
      const r = await subscribeToReplay(wid, { email, firstName, lastName, phone });
      submitBtn?.removeAttribute('disabled');
      if (!r.ok) {
        if (msg) msg.textContent = r.error || "Erreur lors de l'envoi.";
        return;
      }
      replayForm.reset();
      if (msg) msg.textContent = 'Merci ! Vous serez informé·e des prochains webinaires.';
    });
  }

  const pack = document.querySelector('.webinar-registered-pack');
  document.getElementById('btnWebinarCopyJoin')?.addEventListener('click', async () => {
    const inp = document.getElementById('webinarJoinUrlField');
    if (!inp || !(inp instanceof HTMLInputElement)) return;
    try {
      inp.select();
      await navigator.clipboard.writeText(inp.value);
    } catch {
      try {
        inp.select();
        document.execCommand('copy');
      } catch {
        /* ignore */
      }
    }
  });
  document.getElementById('btnWebinarDownloadIcs')?.addEventListener('click', () => {
    const meta = parseIcsMetaFromPack(pack);
    if (!meta?.startsAt) return;
    const ics = buildWebinarIcsPayloadFromMeta(meta);
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `webinaire-${String(meta.id || 'event').slice(0, 12)}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  });
  document.getElementById('btnWebinarSharePage')?.addEventListener('click', async () => {
    const hid = document.getElementById('webinarShareUrlValue');
    const shareUrl =
      hid instanceof HTMLInputElement ? hid.value : window.location.href.split('#')[0];
    if (navigator.share) {
      try {
        await navigator.share({
          title: document.querySelector('.webinar-detail-head .h1')?.textContent || 'Webinaire',
          url: shareUrl,
        });
        return;
      } catch {
        /* annulé ou indisponible */
      }
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      alert('Lien du webinaire copié dans le presse-papiers.');
    } catch {
      window.prompt('Copiez ce lien :', shareUrl);
    }
  });
}
