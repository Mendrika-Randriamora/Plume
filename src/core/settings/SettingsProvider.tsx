import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import i18n, { systemLang } from "@/core/i18n";
import { applyTitleBarMode, readTitleBarMode } from "@/core/layout/titleBar";
import { DEFAULTS, load, save, type Permissions, type Settings, type TitleBarMode } from "./store";
import { applyTheme, syncAppIcon } from "./theme";

interface Ctx {
  settings: Settings;
  /** Mode réellement appliqué à la fenêtre (les décorations sont choisies au lancement). */
  titleBarMode: TitleBarMode;
  /** Enregistre le choix et redémarre Plume pour reconstruire la fenêtre. */
  setTitleBar: (mode: TitleBarMode) => void;
  update: (patch: Partial<Settings>) => void;
  reset: () => void;
}

const SettingsContext = createContext<Ctx>(null!);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(load);
  // Par prudence, on démarre en mode personnalisé : une lecture IPC ratée ne
  // doit jamais laisser l'utilisateur sans barre de titre.
  const [titleBarMode, setTitleBarMode] = useState<TitleBarMode>("custom");

  // Le mode effectif vient de Rust : c'est le seul moyen de savoir avec
  // certitude si la fenêtre a été créée avec des décorations système.
  useEffect(() => {
    let active = true;
    void readTitleBarMode()
      .then((mode) => {
        if (!active) return;
        setTitleBarMode(mode);
        setSettings((s) => (s.titleBar === mode ? s : { ...s, titleBar: mode }));
      })
      .catch((error: unknown) =>
        console.error("Plume: unable to read title bar mode", error),
      );
    return () => {
      active = false;
    };
  }, []);

  const setTitleBar = useCallback((mode: TitleBarMode) => {
    setSettings((s) => (s.titleBar === mode ? s : { ...s, titleBar: mode }));
    void applyTitleBarMode(mode).catch((error: unknown) =>
      console.error("Plume: unable to apply title bar mode", error),
    );
  }, []);

  useEffect(() => {
    applyTheme(settings);
    syncAppIcon(settings);
    save(settings);
    if (i18n.language !== settings.lang) void i18n.changeLanguage(settings.lang);
    if (settings.theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const on = () => {
      applyTheme(settings);
      syncAppIcon(settings);
    };
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [settings]);

  const update = useCallback((patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch })), []);
  const reset = useCallback(() => {
    setSettings({
      ...DEFAULTS,
      lang: systemLang(),
      pageOrder: [...DEFAULTS.pageOrder],
      hiddenPages: [...DEFAULTS.hiddenPages],
      permissions: { ...DEFAULTS.permissions },
    });
    if (titleBarMode !== DEFAULTS.titleBar) {
      void applyTitleBarMode(DEFAULTS.titleBar).catch((error: unknown) =>
        console.error("Plume: unable to apply title bar mode", error),
      );
    }
  }, [titleBarMode]);

  return (
    <SettingsContext.Provider value={{ settings, titleBarMode, setTitleBar, update, reset }}>
      {children}
    </SettingsContext.Provider>
  );
}

export const useSettings = () => useContext(SettingsContext);
export const usePermission = (key: keyof Permissions) => useContext(SettingsContext).settings.permissions[key];
