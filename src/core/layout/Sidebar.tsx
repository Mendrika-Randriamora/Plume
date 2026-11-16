import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { pages } from "@/pages/registry";
import { useSettings } from "@/core/settings/SettingsProvider";
import { SIDEBAR_DEFAULT, SIDEBAR_MAX, SIDEBAR_MIN } from "@/core/settings/store";

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

  const render = (id: string, label: (typeof pages)[number]["label"], Icon: (typeof pages)[number]["icon"]) => (
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
      <nav className={`sidebar ${iconOnly ? "icon-only" : ""}`} style={{ width }}>
        <div className="brand">{iconOnly ? "P" : "Plume"}</div>
        <div className="nav-group">
          {pages.filter((p) => p.position !== "bottom").map((p) => render(p.id, p.label, p.icon))}
        </div>
        <div className="nav-group bottom">
          {pages.filter((p) => p.position === "bottom").map((p) => render(p.id, p.label, p.icon))}
        </div>
      </nav>
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
