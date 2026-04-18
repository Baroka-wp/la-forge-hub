import { PLATFORM_BRAND, COURSE } from './seed-data.js';

/** Texte par défaut (accueil / fallback) — cohérent avec la marque et la formation. */
export const DEFAULT_SITE_DESCRIPTION = `${COURSE.title} — ${COURSE.subtitle}. Parcours vidéo, progression, communauté et webinaires en direct ou replay.`;

export function truncateMetaDescription(text, max = 158) {
  const t = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
}

/** Origine publique pour canonical / Open Graph (priorité à VITE_SITE_URL en prod). */
export function siteOrigin() {
  const fromEnv = String(import.meta.env.VITE_SITE_URL || '')
    .trim()
    .replace(/\/$/, '');
  if (fromEnv) return fromEnv;
  if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin;
  return '';
}

function absoluteUrl(maybeRelative) {
  if (!maybeRelative || typeof maybeRelative !== 'string') return '';
  const s = maybeRelative.trim();
  if (/^https?:\/\//i.test(s)) return s;
  const o = siteOrigin();
  if (!o) return s;
  if (s.startsWith('/')) return `${o}${s}`;
  return `${o}/${s}`;
}

function upsertNamedMeta(name, content) {
  let el = document.head.querySelector(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('name', name);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertPropertyMeta(property, content) {
  let el = document.head.querySelector(`meta[property="${property}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('property', property);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertLinkRel(rel, href) {
  let el = document.head.querySelector(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

/**
 * Met à jour description, canonical, Open Graph et Twitter (le title document est géré par shell).
 * @param {object} p
 * @param {string} p.title
 * @param {string} [p.description]
 * @param {string} [p.path] — pathname (défaut : location.pathname)
 * @param {string} [p.image] — URL absolue ou chemin /…
 * @param {string} [p.type] — og:type
 * @param {boolean} [p.noIndex]
 */
export function applySeoMeta({ title, description, path, image, type = 'website', noIndex = false }) {
  if (typeof document === 'undefined') return;

  const origin = siteOrigin();
  const pathname =
    path != null ? path : typeof window !== 'undefined' ? window.location.pathname : '/';
  const normalizedPath = pathname === '/' ? '/' : pathname.replace(/\/$/, '') || '/';
  const canonical = origin ? `${origin}${normalizedPath === '/' ? '' : normalizedPath}` : '';

  const desc = truncateMetaDescription(description || DEFAULT_SITE_DESCRIPTION);
  upsertNamedMeta('description', desc);

  const robots = noIndex ? 'noindex, nofollow' : 'index, follow';
  upsertNamedMeta('robots', robots);

  if (canonical) upsertLinkRel('canonical', canonical);

  upsertPropertyMeta('og:site_name', PLATFORM_BRAND);
  upsertPropertyMeta('og:title', title);
  upsertPropertyMeta('og:description', desc);
  upsertPropertyMeta('og:type', type);
  if (canonical) upsertPropertyMeta('og:url', canonical);

  const ogImage = absoluteUrl(image || '/favicon.svg');
  if (ogImage) upsertPropertyMeta('og:image', ogImage);

  upsertNamedMeta('twitter:card', 'summary_large_image');
  upsertNamedMeta('twitter:title', title);
  upsertNamedMeta('twitter:description', desc);
  if (ogImage) upsertNamedMeta('twitter:image', ogImage);
}
