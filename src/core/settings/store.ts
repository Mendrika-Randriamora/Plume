import { detectLang, isLang, type Lang } from "@/core/i18n";

export type Rgb = [number, number, number];
export type ThemeMode = "light" | "dark" | "system";
export type FontKey = "system" | "serif" | "rounded" | "mono";

export interface Permissions {
  scanHome: boolean; // lire les fichiers de /home
  deleteFiles: boolean; // envoyer des fichiers à la corbeille
  systemChanges: boolean; // mises à jour et suppression de paquets (mot de passe requis)
}

export interface Settings {
  lang: Lang;
  theme: ThemeMode;
  font: FontKey;
  fontSize: number;
  baseLight: Rgb;
  baseDark: Rgb;
  sidebarWidth: number; // largeur de la barre de navigation (px)
  interfaceV2: boolean; // page encadrée dans une carte arrondie
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
  baseLight: [243, 237, 227], // beige doux
  baseDark: [34, 36, 38], // gris foncé
  sidebarWidth: SIDEBAR_DEFAULT,
  interfaceV2: true,
  permissions: { scanHome: true, deleteFiles: true, systemChanges: true },
};

const KEY = "plume.settings.v1";

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
      permissions: { ...DEFAULTS.permissions, ...p.permissions },
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
