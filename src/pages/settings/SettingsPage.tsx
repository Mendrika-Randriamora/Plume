import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  Button,
  Card,
  ChevronRight,
  GripVertical,
  Info,
  Lock,
  PageHeader,
  Palette,
  PanelLeftClose,
  RotateCcw,
  Search,
  ShieldCheck,
} from "@/core/ui";
import { getCurrentVersion } from "@/core/updater";
import i18n, { LANGS, type Lang } from "@/core/i18n";
import { useSettings } from "@/core/settings/SettingsProvider";
import { resolveDark, FONTS } from "@/core/settings/theme";
import { DEFAULTS } from "@/core/settings/store";
import type { FontKey, IconLibrary, Permissions, Rgb, ThemeMode } from "@/core/settings/store";
import { orderedPages } from "@/pages/registry";
import { SystemAbout } from "./components/SystemAbout";

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

/** Couleurs de texte proposées, adaptées à chaque thème. */
const TEXT_PALETTE = [
  { labelKey: "settings.appearance.textPalette.default", light: "#3a362f", dark: "#e8e5de" },
  { labelKey: "settings.appearance.textPalette.contrast", light: "#000000", dark: "#ffffff" },
  { labelKey: "settings.appearance.textPalette.gray", light: "#6b7280", dark: "#9ca3af" },
  { labelKey: "settings.appearance.textPalette.blue", light: "#1d4ed8", dark: "#93c5fd" },
  { labelKey: "settings.appearance.textPalette.green", light: "#15803d", dark: "#86efac" },
  { labelKey: "settings.appearance.textPalette.orange", light: "#c2410c", dark: "#fdba74" },
  { labelKey: "settings.appearance.textPalette.red", light: "#b91c1c", dark: "#fca5a5" },
  { labelKey: "settings.appearance.textPalette.purple", light: "#7e22ce", dark: "#d8b4fe" },
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
  [
    "internetAccess",
    "settings.permissions.internetAccess.title",
    "settings.permissions.internetAccess.description",
  ],
] as const;

/** Sections affichées dans la liste des réglages, façon GNOME. */
const SECTIONS = [
  { id: "app", icon: Info, titleKey: "settings.app.title", hintKey: "settings.app.hint" },
  { id: "appearance", icon: Palette, titleKey: "settings.appearance.title", hintKey: "settings.appearance.hint" },
  { id: "navigation", icon: PanelLeftClose, titleKey: "settings.navigation.title", hintKey: "settings.navigation.hint" },
  { id: "permissions", icon: ShieldCheck, titleKey: "settings.permissions.title", hintKey: "settings.permissions.hint" },
  { id: "privacy", icon: Lock, titleKey: "settings.privacy.title", hintKey: "settings.privacy.hint" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

/** Convertit une couleur RGB du stockage vers le format attendu par <input type="color">. */
const toHex = ([r, g, b]: Rgb) =>
  `#${[r, g, b]
    .map((v) => Math.min(255, Math.max(0, Math.round(v))).toString(16).padStart(2, "0"))
    .join("")}`;

const fromHex = (hex: string): Rgb => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

const FONT_SIZE_MIN = 13;
const FONT_SIZE_MAX = 20;

/** Fréquences proposées pour les relevés en direct (ms). */
const REFRESH_OPTIONS = [1000, 2000, 5000, 10_000];

/** Badge affiché pour une page qui ne fonctionne que sur un seul système. */
const PLATFORM_LABELS = {
  linux: "settings.navigation.platform.linuxOnly",
  windows: "settings.navigation.platform.windowsOnly",
  macos: "settings.navigation.platform.macosOnly",
} as const;

export function SettingsPage() {
  const { t } = useTranslation();
  const { settings: s, titleBarMode, setTitleBar, update, reset } = useSettings();
  const [version, setVersion] = useState("…");
  const [section, setSection] = useState<SectionId | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [navQuery, setNavQuery] = useState("");
  const dark = resolveDark(s);
  const bg = dark ? s.baseDark : s.baseLight;
  const ink = dark ? s.textDark : s.textLight;
  const themeLabel = dark ? t("settings.appearance.darkTheme") : t("settings.appearance.lightTheme");

  // Seules les pages du haut sont personnalisables : les réglages restent
  // toujours accessibles, épinglés en bas de la barre latérale.
  const ordered = orderedPages(s.pageOrder);
  const customPages = ordered.filter((p) => p.position !== "bottom");
  const navQueryNormalized = navQuery.trim().toLowerCase();
  const navPages = navQueryNormalized
    ? customPages.filter((p) => t(p.label).toLowerCase().includes(navQueryNormalized))
    : customPages;

  useEffect(() => {
    void getCurrentVersion().then((v) => setVersion(v ?? "—"));
  }, []);

  // La page change de contenu sans changer de route : on revient en haut.
  useEffect(() => {
    const scroller = document.querySelector<HTMLElement>(".content");
    if (scroller) scroller.scrollTop = 0;
  }, [section]);

  const setBase = (hex: string) =>
    update(dark ? { baseDark: fromHex(hex) } : { baseLight: fromHex(hex) });

  const setText = (hex: string) =>
    update(dark ? { textDark: fromHex(hex) } : { textLight: fromHex(hex) });

  const setFontSize = (value: number) => {
    if (!Number.isFinite(value)) return;
    update({ fontSize: Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, Math.round(value))) });
  };

  const changeLang = (lang: Lang) => {
    update({ lang });
    void i18n.changeLanguage(lang);
  };

  const togglePage = (id: string) => {
    const hiddenPages = s.hiddenPages.includes(id)
      ? s.hiddenPages.filter((pageId) => pageId !== id)
      : [...s.hiddenPages, id];
    update({ hiddenPages });
  };

  /** Enregistre l'ordre des pages personnalisables, les pages épinglées restant en bas. */
  const applyOrder = (ids: string[]) => {
    const bottomIds = ordered.filter((p) => p.position === "bottom").map((p) => p.id);
    update({ pageOrder: [...ids, ...bottomIds] });
  };

  // Alternative au glisser-déposer pour le clavier : flèches haut/bas sur la poignée.
  const movePage = (id: string, delta: number) => {
    const ids = customPages.map((p) => p.id);
    const from = ids.indexOf(id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= ids.length) return;

    [ids[from], ids[to]] = [ids[to], ids[from]];
    applyOrder(ids);
  };

  const dropPage = (targetId: string) => {
    if (!dragId || dragId === targetId) {
      setDragId(null);
      setOverId(null);
      return;
    }

    const ids = customPages.map((p) => p.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) {
      setDragId(null);
      setOverId(null);
      return;
    }

    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved);
    applyOrder(ids);
    setDragId(null);
    setOverId(null);
  };

  const resetButton = (
    <Button variant="ghost" icon={RotateCcw} onClick={reset}>{t("settings.resetAll")}</Button>
  );

  /** Réinitialise une seule sous-catégorie : un reset d'apparence ne remet pas en cause la sidebar. */
  const resetSection = (id: SectionId) => {
    switch (id) {
      case "app":
        update({ refreshInterval: DEFAULTS.refreshInterval });
        break;
      case "appearance":
        update({
          theme: DEFAULTS.theme,
          lang: DEFAULTS.lang,
          font: DEFAULTS.font,
          fontSize: DEFAULTS.fontSize,
          iconLibrary: DEFAULTS.iconLibrary,
          interfaceV2: DEFAULTS.interfaceV2,
          baseLight: DEFAULTS.baseLight,
          baseDark: DEFAULTS.baseDark,
          textLight: DEFAULTS.textLight,
          textDark: DEFAULTS.textDark,
        });
        if (titleBarMode !== DEFAULTS.titleBar) setTitleBar(DEFAULTS.titleBar);
        break;
      case "navigation":
        update({ pageOrder: [...DEFAULTS.pageOrder], hiddenPages: [...DEFAULTS.hiddenPages] });
        break;
      case "permissions":
        update({ permissions: { ...DEFAULTS.permissions } });
        break;
      case "privacy":
        break;
    }
  };

  if (!section) {
    return (
      <>
        <PageHeader title={t("settings.title")} subtitle={t("settings.subtitle")} action={resetButton} />

        <SystemAbout />

        <Card>
          <div className="settings-list">
            {SECTIONS.map(({ id, icon: Icon, titleKey, hintKey }) => (
              <button key={id} className="settings-row" onClick={() => setSection(id)}>
                <span className="settings-icon"><Icon size={19} strokeWidth={1.75} /></span>
                <span className="grow">
                  <span className="settings-row-title">{t(titleKey)}</span>
                  <span className="muted small block">{t(hintKey)}</span>
                </span>
                <ChevronRight size={18} strokeWidth={1.75} className="settings-chevron" />
              </button>
            ))}
          </div>
        </Card>
      </>
    );
  }

  const current = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0];

  return (
    <>
      <header className="page-head">
        <div className="row gap">
          <Button
            variant="ghost"
            icon={ArrowLeft}
            className="icon-btn"
            onClick={() => setSection(null)}
            aria-label={t("common.back")}
            title={t("common.back")}
          />
          <div>
            <h1>{t(current.titleKey)}</h1>
            <p className="muted">{t(current.hintKey)}</p>
          </div>
        </div>
        <Button variant="ghost" icon={RotateCcw} onClick={() => resetSection(current.id)}>{t("settings.reset")}</Button>
      </header>

      {section === "app" && (
        <Card>
          <div className="field">
            <span>{t("settings.app.version")}</span>
            <span className="muted">{version}</span>
          </div>
          <div className="field">
            <span>
              {t("settings.app.refresh")}
              <span className="muted small block">{t("settings.app.refreshHint")}</span>
            </span>
            <select
              value={s.refreshInterval}
              onChange={(e) => update({ refreshInterval: Number(e.target.value) })}
            >
              {REFRESH_OPTIONS.map((ms) => (
                <option key={ms} value={ms}>
                  {t("settings.app.refreshSeconds", { seconds: ms / 1000 })}
                </option>
              ))}
            </select>
          </div>
        </Card>
      )}

      {section === "appearance" && (
        <Card>
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
            <span>{t("settings.appearance.fontSize")}</span>
            <input
              type="number"
              className="number-input"
              min={FONT_SIZE_MIN}
              max={FONT_SIZE_MAX}
              value={s.fontSize}
              onChange={(e) => setFontSize(Number(e.target.value))}
            />
          </div>
          <div className="field">
            <span>{t("settings.appearance.iconLibrary")}</span>
            <select value={s.iconLibrary} onChange={(e) => update({ iconLibrary: e.target.value as IconLibrary })}>
              <option value="sketchy">{t("settings.appearance.iconLibrarySketchy")}</option>
              <option value="lucide">{t("settings.appearance.iconLibraryLucide")}</option>
            </select>
          </div>
          <label className="field">
            <span>
              {t("settings.appearance.interfaceV2")}
              <span className="muted small block">{t("settings.appearance.interfaceV2Hint")}</span>
            </span>
            <input
              type="checkbox"
              checked={s.interfaceV2}
              onChange={(e) => update({ interfaceV2: e.target.checked })}
            />
          </label>
          <div className="field">
            <span>
              {t("settings.appearance.titleBar")}
              <span className="muted small block">{t("settings.appearance.titleBarHint")}</span>
            </span>
            <div className="seg">
              <button
                type="button"
                className={s.titleBar === "custom" ? "on" : ""}
                onClick={() => {
                  if (s.titleBar !== "custom") setTitleBar("custom");
                }}
              >
                {t("settings.appearance.titleBarCustom")}
              </button>
              <button
                type="button"
                className={s.titleBar === "native" ? "on" : ""}
                onClick={() => {
                  if (s.titleBar !== "native") setTitleBar("native");
                }}
              >
                {t("settings.appearance.titleBarNative")}
              </button>
            </div>
          </div>
          <div className="field">
            <span>{t("settings.appearance.background", { theme: themeLabel })}</span>
            <input
              type="color"
              value={toHex(bg)}
              onChange={(e) => setBase(e.target.value)}
              aria-label={t("settings.appearance.background", { theme: themeLabel })}
            />
          </div>
          <div className="field col">
            <div className="color-field-head">
              <span>{t("settings.appearance.textColor", { theme: themeLabel })}</span>
              <input
                type="color"
                value={toHex(ink)}
                onChange={(e) => setText(e.target.value)}
                aria-label={t("settings.appearance.textColor", { theme: themeLabel })}
              />
            </div>
            <div className="color-palette" role="group" aria-label={t("settings.appearance.textPalette.title")}>
              {TEXT_PALETTE.map(({ labelKey, light, dark: darkColor }) => {
                const value = dark ? darkColor : light;
                const active = toHex(ink).toLowerCase() === value.toLowerCase();
                return (
                  <button
                    key={labelKey}
                    type="button"
                    className={`color-swatch ${active ? "on" : ""}`}
                    style={{ background: value }}
                    title={t(labelKey)}
                    aria-label={t(labelKey)}
                    aria-pressed={active}
                    onClick={() => setText(value)}
                  />
                );
              })}
            </div>
          </div>
        </Card>
      )}

      {section === "navigation" && (
        <>
          <div className="search-container">
            <Search size={16} className="search-icon" />
            <input
              type="text"
              className="search-input"
              placeholder={t("common.search")}
              value={navQuery}
              onChange={(e) => setNavQuery(e.target.value)}
              aria-label={t("common.search")}
            />
          </div>
          <Card>
            <div className="page-order-list">
              {navPages.map((p) => {
                const Icon = p.icon;
                const shown = !s.hiddenPages.includes(p.id);
                return (
                  <div
                    className={`page-order-row ${dragId === p.id ? "dragging" : ""} ${
                      overId === p.id && dragId !== p.id ? "drag-over" : ""
                    }`}
                    key={p.id}
                    onDragOver={(e) => {
                      if (!dragId) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      setOverId((id) => (id === p.id ? id : p.id));
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      dropPage(p.id);
                    }}
                  >
                    <label className="page-order-main">
                      <input
                        type="checkbox"
                        checked={shown}
                        onChange={() => togglePage(p.id)}
                        aria-label={t("settings.navigation.visible", { page: t(p.label) })}
                      />
                      <span className="settings-icon"><Icon size={19} strokeWidth={1.75} /></span>
                      <span className={`grow ${shown ? "" : "muted"}`}>{t(p.label)}</span>
                    </label>
                    {p.platform && (
                      <span className="chip muted small page-platform">
                        {t(PLATFORM_LABELS[p.platform])}
                      </span>
                    )}
                    <span
                      className="page-order-handle"
                      draggable
                      role="button"
                      tabIndex={0}
                      aria-label={t("settings.navigation.drag", { page: t(p.label) })}
                      aria-keyshortcuts="ArrowUp ArrowDown"
                      title={t("settings.navigation.drag", { page: t(p.label) })}
                      onDragStart={(e) => {
                        setDragId(p.id);
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", p.id);
                        const row = e.currentTarget.closest(".page-order-row");
                        if (row instanceof HTMLElement) {
                          e.dataTransfer.setDragImage(row, row.offsetWidth - 24, 24);
                        }
                      }}
                      onDragEnd={() => {
                        setDragId(null);
                        setOverId(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "ArrowUp") {
                          e.preventDefault();
                          movePage(p.id, -1);
                        } else if (e.key === "ArrowDown") {
                          e.preventDefault();
                          movePage(p.id, 1);
                        }
                      }}
                    >
                      <GripVertical size={18} strokeWidth={1.75} />
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="muted small">{t("settings.navigation.pinned")}</p>
          </Card>
        </>
      )}

      {section === "permissions" && (
        <Card>
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
      )}

      {section === "privacy" && (
        <Card>
          <p className="small">
            {t("settings.privacy.text")}
          </p>
        </Card>
      )}
    </>
  );
}
