import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import fr from "./locales/fr.json";

export const LANGS = { fr: "Français", en: "English" } as const;
export type Lang = keyof typeof LANGS;

type Primitive = string | number | boolean | null;
type DeepKeys<T> = T extends object
  ? {
      [K in keyof T & string]: T[K] extends Primitive ? K : `${K}.${DeepKeys<T[K]>}`;
    }[keyof T & string]
  : never;

/** Toutes les clés valides, dérivées de fr.json (langue de référence). */
export type TranslationKey = DeepKeys<typeof fr>;

const SETTINGS_KEY = "plume.settings.v1";

export function isLang(value: unknown): value is Lang {
  return typeof value === "string" && value in LANGS;
}

/** Langue choisie dans les réglages, sinon langue du système (français par défaut). */
export function detectLang(): Lang {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as { lang?: unknown };
      if (isLang(saved.lang)) return saved.lang;
    }
  } catch {
    /* stockage illisible : on retombe sur la langue du système */
  }

  return typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("fr")
    ? "fr"
    : "en";
}

void i18n.use(initReactI18next).init({
  resources: {
    fr: { translation: fr },
    en: { translation: en },
  },
  lng: detectLang(),
  fallbackLng: "fr",
  interpolation: { escapeValue: false },
  initAsync: false,
});

/** Traduit une clé construite dynamiquement (codes d'erreur, unités, colonnes). */
export function translate(key: string, options?: Record<string, unknown>): string {
  return (i18n.t as unknown as (k: string, o?: Record<string, unknown>) => string)(key, options);
}

/** Vrai si la clé existe réellement dans la langue de référence. */
export function hasKey(key: string): boolean {
  return (i18n.exists as unknown as (k: string) => boolean)(key);
}

function syncDocumentLang() {
  if (typeof document !== "undefined") {
    document.documentElement.lang = i18n.resolvedLanguage ?? i18n.language;
  }
}

syncDocumentLang();
i18n.on("languageChanged", syncDocumentLang);

export default i18n;
