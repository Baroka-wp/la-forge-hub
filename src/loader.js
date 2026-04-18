/**
 * Loader global (logo) — compteur pour appels imbriqués (render + fetch API).
 */
let depth = 0;

export function pushLoading() {
  depth += 1;
  if (depth === 1) {
    document.body.classList.add('is-global-loading');
    document.body.setAttribute('aria-busy', 'true');
    const el = document.getElementById('global-loader');
    if (el) {
      el.hidden = false;
      el.setAttribute('aria-hidden', 'false');
    }
  }
}

export function popLoading() {
  depth = Math.max(0, depth - 1);
  if (depth === 0) {
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
