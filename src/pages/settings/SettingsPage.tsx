import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { RotateCcw } from "lucide-react";
import { Button, Card, PageHeader } from "@/core/ui";
import { getCurrentVersion } from "@/core/updater";
import i18n, { LANGS, type Lang } from "@/core/i18n";
import { useSettings } from "@/core/settings/SettingsProvider";
import { resolveDark, FONTS } from "@/core/settings/theme";
import type { FontKey, Permissions, Rgb, ThemeMode } from "@/core/settings/store";

const THEMES = [
  ["light", "settings.appearance.themes.light"],
  ["dark", "settings.appearance.themes.dark"],
  ["system", "settings.appearance.themes.system"],
] as const;

const FONT_LABELS = {
  system: "settings.appearance.fonts.system",
  rounded: "settings.appearance.fonts.rounded",
  serif: "settings.appearance.fonts.serif",
  mono: "settings.appearance.fonts.mono",
} as const;

const COLORS = [
  ["red", "settings.appearance.colors.red"],
  ["green", "settings.appearance.colors.green"],
  ["blue", "settings.appearance.colors.blue"],
] as const;

const PERMS = [
  [
    "scanHome",
    "settings.permissions.scanHome.title",
    "settings.permissions.scanHome.description",
  ],
  [
    "deleteFiles",
    "settings.permissions.deleteFiles.title",
    "settings.permissions.deleteFiles.description",
  ],
  [
    "systemChanges",
    "settings.permissions.systemChanges.title",
    "settings.permissions.systemChanges.description",
  ],
] as const;

export function SettingsPage() {
  const { t } = useTranslation();
  const { settings: s, update, reset } = useSettings();
  const [version, setVersion] = useState("…");
  const dark = resolveDark(s);
  const rgb = dark ? s.baseDark : s.baseLight;

  useEffect(() => {
    void getCurrentVersion().then((v) => setVersion(v ?? "—"));
  }, []);

  const setRgb = (i: number, v: number) => {
    const next = [...rgb] as Rgb;
    next[i] = v;
    update(dark ? { baseDark: next } : { baseLight: next });
  };

  const changeLang = (lang: Lang) => {
    update({ lang });
    void i18n.changeLanguage(lang);
  };

  return (
    <>
      <PageHeader
        title={t("settings.title")}
        subtitle={t("settings.subtitle")}
        action={<Button variant="ghost" icon={RotateCcw} onClick={reset}>{t("settings.reset")}</Button>}
      />

      <Card title={t("settings.app.title")} hint={t("settings.app.hint")}>
        <div className="field">
          <span>{t("settings.app.version")}</span>
          <span className="muted">{version}</span>
        </div>
        <p className="small muted">
          {t("settings.app.updatesNote")}
        </p>
      </Card>

      <Card title={t("settings.appearance.title")}>
        <div className="field">
          <span>{t("settings.appearance.theme")}</span>
          <div className="seg">
            {THEMES.map(([id, labelKey]) => (
              <button key={id} className={s.theme === id ? "on" : ""} onClick={() => update({ theme: id as ThemeMode })}>
                {t(labelKey)}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span>{t("settings.appearance.language")}</span>
          <select value={s.lang} onChange={(e) => changeLang(e.target.value as Lang)}>
            {(Object.keys(LANGS) as Lang[]).map((code) => (
              <option key={code} value={code}>{LANGS[code]}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <span>{t("settings.appearance.font")}</span>
          <select value={s.font} onChange={(e) => update({ font: e.target.value as FontKey })}>
            {(Object.keys(FONTS) as FontKey[]).map((k) => (
              <option key={k} value={k}>{t(FONT_LABELS[k])}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <span>{t("settings.appearance.fontSize", { size: s.fontSize })}</span>
          <input type="range" min={13} max={20} value={s.fontSize} onChange={(e) => update({ fontSize: +e.target.value })} />
        </div>
        <div className="field col">
          <span>
            {t("settings.appearance.background", {
              theme: dark ? t("settings.appearance.darkTheme") : t("settings.appearance.lightTheme"),
            })}
          </span>
          {COLORS.map(([id, labelKey], i) => (
            <label key={id} className="slider">
              <span className="small muted">{t(labelKey)} · {rgb[i]}</span>
              <input type="range" min={0} max={255} value={rgb[i]} onChange={(e) => setRgb(i, +e.target.value)} />
            </label>
          ))}
        </div>
      </Card>

      <Card title={t("settings.permissions.title")} hint={t("settings.permissions.hint")}>
        {PERMS.map(([key, titleKey, descKey]) => (
          <label key={key} className="perm">
            <input
              type="checkbox"
              checked={s.permissions[key as keyof Permissions]}
              onChange={(e) => update({ permissions: { ...s.permissions, [key]: e.target.checked } })}
            />
            <span>
              {t(titleKey)}
              <span className="muted small block">{t(descKey)}</span>
            </span>
          </label>
        ))}
      </Card>

      <Card title={t("settings.privacy.title")}>
        <p className="small">
          {t("settings.privacy.text")}
        </p>
      </Card>
    </>
  );
}
