import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import i18n, { detectLang } from "@/core/i18n";
import { DEFAULTS, load, save, type Permissions, type Settings } from "./store";
import { applyTheme } from "./theme";

interface Ctx {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  reset: () => void;
}

const SettingsContext = createContext<Ctx>(null!);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(load);

  useEffect(() => {
    applyTheme(settings);
    save(settings);
    if (i18n.language !== settings.lang) void i18n.changeLanguage(settings.lang);
    if (settings.theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const on = () => applyTheme(settings);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [settings]);

  const update = useCallback((patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch })), []);
  const reset = useCallback(
    () =>
      setSettings({
        ...DEFAULTS,
        lang: detectLang(),
        permissions: { ...DEFAULTS.permissions },
      }),
    [],
  );

  return <SettingsContext.Provider value={{ settings, update, reset }}>{children}</SettingsContext.Provider>;
}

export const useSettings = () => useContext(SettingsContext);
export const usePermission = (key: keyof Permissions) => useContext(SettingsContext).settings.permissions[key];
