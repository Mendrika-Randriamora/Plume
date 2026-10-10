import type { FontKey, Settings } from "./store";

export const FONTS: Record<FontKey, { label: string; stack: string }> = {
  system: { label: "Système", stack: 'system-ui, "Segoe UI", "Noto Sans", sans-serif' },
  rounded: { label: "Arrondie", stack: 'ui-rounded, "Nunito", "Quicksand", system-ui, sans-serif' },
  serif: { label: "Avec empattements", stack: 'Georgia, "Noto Serif", serif' },
  mono: { label: "Monospace", stack: 'ui-monospace, "JetBrains Mono", "DejaVu Sans Mono", monospace' },
};

export function resolveDark(s: Settings): boolean {
  if (s.theme === "system") return window.matchMedia("(prefers-color-scheme: dark)").matches;
  return s.theme === "dark";
}

export function applyTheme(s: Settings) {
  const dark = resolveDark(s);
  const [r, g, b] = dark ? s.baseDark : s.baseLight;
  const root = document.documentElement;
  root.dataset.theme = dark ? "dark" : "light";
  root.style.setProperty("--base", `rgb(${r}, ${g}, ${b})`);
  root.style.setProperty("--font", FONTS[s.font].stack);
  root.style.setProperty("--font-size", `${s.fontSize}px`);
}
