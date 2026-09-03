/**
 * Loader global (logo) — compteur pour appels imbriqués (render + fetch API).
 * L'affichage visuel est retardé (SHOW_DELAY_MS) : une navigation qui se résout
 * avant ce délai (données déjà en cache) ne fait jamais apparaître le loader.
 */
let depth = 0;
let showTimer = null;
const SHOW_DELAY_MS = 150;

export function pushLoading() {
  depth += 1;
  if (depth === 1) {
    document.body.setAttribute('aria-busy', 'true');
    showTimer = setTimeout(() => {
      showTimer = null;
      document.body.classList.add('is-global-loading');
      const el = document.getElementById('global-loader');
      if (el) {
        el.hidden = false;
        el.setAttribute('aria-hidden', 'false');
      }
    }, SHOW_DELAY_MS);
  }
}

export function popLoading() {
  depth = Math.max(0, depth - 1);
  if (depth === 0) {
    if (showTimer) {
      clearTimeout(showTimer);
      showTimer = null;
    }
    document.body.classList.remove('is-global-loading');
    document.body.removeAttribute('aria-busy');
    const el = document.getElementById('global-loader');
    if (el) {
      el.hidden = true;
      el.setAttribute('aria-hidden', 'true');
    }
  }
}

/**
 * @template T
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withLoading(fn) {
  pushLoading();
  try {
    return await fn();
  } finally {
    popLoading();
  }
}
