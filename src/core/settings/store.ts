export type Rgb = [number, number, number];
export type ThemeMode = "light" | "dark" | "system";
export type FontKey = "system" | "serif" | "rounded" | "mono";

export interface Permissions {
  scanHome: boolean; // lire les fichiers de /home
  deleteFiles: boolean; // envoyer des fichiers à la corbeille
  systemChanges: boolean; // mises à jour et suppression de paquets (mot de passe requis)
}

export interface Settings {
  theme: ThemeMode;
  font: FontKey;
  fontSize: number;
  baseLight: Rgb;
  baseDark: Rgb;
  permissions: Permissions;
}

export const DEFAULTS: Settings = {
  theme: "system",
  font: "system",
  fontSize: 15,
  baseLight: [243, 237, 227], // beige doux
  baseDark: [34, 36, 38], // gris foncé
  permissions: { scanHome: true, deleteFiles: true, systemChanges: true },
};

const KEY = "plume.settings.v1";

export function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const p = JSON.parse(raw) as Partial<Settings>;
    return { ...DEFAULTS, ...p, permissions: { ...DEFAULTS.permissions, ...p.permissions } };
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
