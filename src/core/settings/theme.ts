import { call } from "@/core/ipc";
import type { FontKey, Settings } from "./store";

export const FONTS: Record<FontKey, { stack: string }> = {
  system: { stack: 'system-ui, "Segoe UI", "Noto Sans", sans-serif' },
  rounded: { stack: 'ui-rounded, "Nunito", "Quicksand", system-ui, sans-serif' },
  serif: { stack: 'Georgia, "Noto Serif", serif' },
  mono: { stack: 'ui-monospace, "JetBrains Mono", "DejaVu Sans Mono", monospace' },
};

export function resolveDark(s: Settings): boolean {
  if (s.theme === "system") return window.matchMedia("(prefers-color-scheme: dark)").matches;
  return s.theme === "dark";
}

export function applyTheme(s: Settings) {
  const dark = resolveDark(s);
  const [r, g, b] = dark ? s.baseDark : s.baseLight;
  const [tr, tg, tb] = dark ? s.textDark : s.textLight;
  const root = document.documentElement;
  root.dataset.theme = dark ? "dark" : "light";
  root.dataset.shell = s.interfaceV2 ? "card" : "flat";
  root.style.setProperty("--base", `rgb(${r}, ${g}, ${b})`);
  root.style.setProperty("--ink", `rgb(${tr}, ${tg}, ${tb})`);
  root.style.setProperty("--font", FONTS[s.font].stack);
  root.style.setProperty("--font-size", `${s.fontSize}px`);
}

/** Dernier thème appliqué à l'icône de l'application (null = pas encore appliqué). */
let appliedIconDark: boolean | null = null;

/** Aligne l'icône native (fenêtre et entrée .desktop) sur le thème actif. */
export function syncAppIcon(s: Settings) {
  const dark = resolveDark(s);
  if (dark === appliedIconDark) return;
  appliedIconDark = dark;
  void call("sync_app_icon", { dark }).catch(() => {
    /* mode navigateur (hors Tauri) : aucune fenêtre native à mettre à jour */
    appliedIconDark = null;
  });
}
