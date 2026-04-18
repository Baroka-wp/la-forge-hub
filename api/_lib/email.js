/** E-mail normalisé pour clés et comparaisons (insensible à la casse). */
export function normalizeEmail(s) {
  return String(s ?? '').trim().toLowerCase();
}
