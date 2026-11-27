/**
 * Détecte Windows depuis l'agent du WebView, sans ajouter de plugin Tauri.
 * Sert uniquement à adapter les libellés propres à cron / au Planificateur
 * de tâches : les commandes et les structures de données restent identiques.
 */
export function isWindows(): boolean {
  return typeof navigator !== "undefined" && /Windows/i.test(navigator.userAgent);
}
