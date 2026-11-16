import { useEffect, useState } from "react";

/** Palette des séries : lisible sur fond clair comme sur fond sombre. */
export const SERIES = [
  "#d64545", // rouge
  "#e08a2f", // orange
  "#d9b62c", // jaune
  "#3fae6d", // vert
  "#3d8fd1", // bleu
  "#9b6bd1", // violet
  "#c25d9e", // rose
  "#4fa8a8", // turquoise
];

export interface ChartTheme {
  ink: string;
  muted: string;
  line: string;
  surface: string;
  font: string;
}

function readTheme(): ChartTheme {
  const css = getComputedStyle(document.documentElement);
  const value = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  return {
    ink: value("--ink", "#3a362f"),
    muted: value("--muted", "#8a857c"),
    line: value("--line", "#d9d3c7"),
    surface: value("--surface", "#f7f2e9"),
    font: value("--font", "system-ui, sans-serif"),
  };
}

/** Relit les couleurs du thème (mode clair/sombre et couleur de base personnalisée). */
export function useChartTheme(): ChartTheme {
  const [theme, setTheme] = useState<ChartTheme>(readTheme);

  useEffect(() => {
    const sync = () => setTheme(readTheme());
    // `applyTheme` modifie data-theme et les variables CSS sur <html>.
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "style"],
    });
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", sync);
    return () => {
      observer.disconnect();
      media.removeEventListener("change", sync);
    };
  }, []);

  return theme;
}
