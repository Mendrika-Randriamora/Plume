import { detectLang, isLang, type Lang } from "@/core/i18n";

export type Rgb = [number, number, number];
export type ThemeMode = "light" | "dark" | "system";
export type FontKey = "system" | "serif" | "rounded" | "mono";
export type IconLibrary = "lucide" | "sketchy";
/** Barre de titre de la fenêtre : personnalisée intégrée à Plume ou barre système native. */
export type TitleBarMode = "custom" | "native";

export interface Permissions {
  scanHome: boolean; // lire les fichiers de /home
  deleteFiles: boolean; // envoyer des fichiers à la corbeille
  systemChanges: boolean; // mises à jour et suppression de paquets (mot de passe requis)
  internetAccess: boolean; // autorisation à accès Internet pour les mises à jour
}

export interface Settings {
  lang: Lang;
  theme: ThemeMode;
  font: FontKey;
  fontSize: number;
  refreshInterval: number; // intervalle de rafraîchissement des données en direct (ms)
  baseLight: Rgb;
  baseDark: Rgb;
  textLight: Rgb;
  textDark: Rgb;
  sidebarWidth: number; // largeur de la barre de navigation (px)
  pageOrder: string[]; // ordre des pages dans la barre latérale (vide = ordre du registre)
  hiddenPages: string[]; // pages masquées de la barre latérale
  interfaceV2: boolean; // page encadrée dans une carte arrondie
  titleBar: TitleBarMode; // barre de titre personnalisée intégrée ou barre système native
  iconLibrary: IconLibrary; // bibliothèque d'icônes de l'interface (lucide, sketchy)
  permissions: Permissions;
}

/** Bornes de la barre latérale : à la largeur minimale, seules les icônes restent visibles. */
export const SIDEBAR_MIN = 64;
export const SIDEBAR_MAX = 360;
export const SIDEBAR_DEFAULT = 210;

export const DEFAULTS: Settings = {
  lang: detectLang(),
  theme: "system",
  font: "system",
  fontSize: 15,
  refreshInterval: 1000,
  baseLight: [243, 237, 227], // beige doux
  baseDark: [34, 36, 38], // gris foncé
  textLight: [58, 54, 47], // encre sombre sur fond clair
  textDark: [232, 229, 222], // encre claire sur fond sombre
  sidebarWidth: SIDEBAR_DEFAULT,
  pageOrder: [],
  // Les pages Configuration et Démarrage sont masquées par défaut : elles
  // s'ouvrent depuis la barre de recherche ou depuis les réglages.
  hiddenPages: ["config", "startup"],
  interfaceV2: true,
  titleBar: "custom",
  iconLibrary: "sketchy",
  permissions: { scanHome: true, deleteFiles: true, systemChanges: true, internetAccess: true },
};

const KEY = "plume.settings.v1";

/** Ne garde que des identifiants de page valides (chaînes de caractères). */
const pageIds = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];

export function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const p = JSON.parse(raw) as Partial<Settings>;
    return {
      ...DEFAULTS,
      ...p,
      lang: isLang(p.lang) ? p.lang : DEFAULTS.lang,
      sidebarWidth:
        typeof p.sidebarWidth === "number" && Number.isFinite(p.sidebarWidth)
          ? Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Math.round(p.sidebarWidth)))
          : DEFAULTS.sidebarWidth,
      refreshInterval:
        typeof p.refreshInterval === "number" && Number.isFinite(p.refreshInterval)
          ? Math.min(60_000, Math.max(500, Math.round(p.refreshInterval)))
          : DEFAULTS.refreshInterval,
      pageOrder: pageIds(p.pageOrder),
      hiddenPages: pageIds(p.hiddenPages),
      permissions: { ...DEFAULTS.permissions, ...p.permissions },
      iconLibrary: p.iconLibrary === "lucide" || p.iconLibrary === "sketchy" ? p.iconLibrary : DEFAULTS.iconLibrary,
    };
  } catch {
    return DEFAULTS;
  }
}

export function save(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* stockage indisponible : on ignore */
  }
}
