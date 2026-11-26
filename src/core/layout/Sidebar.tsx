import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { visiblePages, type PageDef } from "@/pages/registry";
import { useSettings } from "@/core/settings/SettingsProvider";
import { SIDEBAR_DEFAULT, SIDEBAR_MAX, SIDEBAR_MIN } from "@/core/settings/store";
import { PanelLeftClose, PanelLeftOpen } from "@/core/ui";
import { PlumeMark } from "./PlumeMark";

/** En dessous de cette largeur, les libellés disparaissent et seules les icônes restent. */
const ICON_ONLY_BELOW = 150;

const clamp = (w: number) => Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, w));

interface Props {
  current: string;
  onSelect: (id: string) => void;
}

export function Sidebar({ current, onSelect }: Props) {
  const { t } = useTranslation();
  const { settings, update } = useSettings();
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<number | null>(null);

  const width = preview ?? settings.sidebarWidth;
  const iconOnly = width < ICON_ONLY_BELOW;
  const pending = useRef(settings.sidebarWidth);

  const visible = useMemo(
    () => visiblePages(settings.pageOrder, settings.hiddenPages),
    [settings.pageOrder, settings.hiddenPages],
  );
  const top = visible.filter((p) => p.position !== "bottom");
  const bottom = visible.filter((p) => p.position === "bottom");

  // Mémorise la dernière largeur déployée pour la restaurer au dépliage.
  const lastExpanded = useRef(
    settings.sidebarWidth >= ICON_ONLY_BELOW ? settings.sidebarWidth : SIDEBAR_DEFAULT,
  );
  if (settings.sidebarWidth >= ICON_ONLY_BELOW) lastExpanded.current = settings.sidebarWidth;

  const toggleSidebar = () =>
    update({ sidebarWidth: iconOnly ? lastExpanded.current : SIDEBAR_MIN });

  const startDrag = (e: ReactPointerEvent) => {
    e.preventDefault();
    pending.current = settings.sidebarWidth;
    setDragging(true);
    document.body.classList.add("resizing");

    const startX = e.clientX;
    const startWidth = settings.sidebarWidth;

    const move = (ev: PointerEvent) => {
      pending.current = clamp(startWidth + ev.clientX - startX);
      setPreview(pending.current);
    };

    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      document.body.classList.remove("resizing");
      setDragging(false);
      setPreview(null);
      update({ sidebarWidth: pending.current });
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  };

  const render = ({ id, label, icon: Icon }: PageDef) => (
    <button
      key={id}
      className={`nav-item ${current === id ? "active" : ""}`}
      onClick={() => onSelect(id)}
      title={iconOnly ? t(label) : undefined}
    >
      <Icon size={18} strokeWidth={1.75} />
      <span>{t(label)}</span>
    </button>
  );

  return (
    <>
      <div className="sidebar-wrap">
        <nav className={`sidebar ${iconOnly ? "icon-only" : ""}`} style={{ width }}>
          <div className="sidebar-head">
            <div className="brand">
              <PlumeMark size={35} />
              {!iconOnly && <span>Plume</span>}
            </div>
          </div>
          <div className="nav-group">
            {top.map(render)}
          </div>
          <div className="nav-group bottom">
            {bottom.map(render)}
          </div>
        </nav>
        <button
          className="sidebar-toggle"
          onClick={toggleSidebar}
          title={t(iconOnly ? "common.expandSidebar" : "common.collapseSidebar")}
          aria-label={t(iconOnly ? "common.expandSidebar" : "common.collapseSidebar")}
          aria-expanded={!iconOnly}
        >
          {iconOnly ? <PanelLeftOpen size={18} strokeWidth={1.75} /> : <PanelLeftClose size={18} strokeWidth={1.75} />}
        </button>
      </div>
      <div
        className={`sidebar-resizer ${dragging ? "active" : ""}`}
        role="separator"
        aria-orientation="vertical"
        aria-valuemin={SIDEBAR_MIN}
        aria-valuemax={SIDEBAR_MAX}
        aria-valuenow={Math.round(width)}
        title={t("common.resizeSidebar")}
        onPointerDown={startDrag}
        onDoubleClick={() => update({ sidebarWidth: SIDEBAR_DEFAULT })}
      />
    </>
  );
}
