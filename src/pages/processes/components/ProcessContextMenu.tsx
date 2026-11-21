import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Info, RotateCw, Square } from "lucide-react";

interface Props {
  x: number;
  y: number;
  allowed: boolean;
  onStop: () => void;
  onRestart: () => void;
  onDetails: () => void;
  onClose: () => void;
}

const MENU_WIDTH = 220;
const MENU_HEIGHT = 140;
const MARGIN = 8;

/** Menu contextuel façon moniteur système, positionné au curseur. */
export function ProcessContextMenu({
  x,
  y,
  allowed,
  onStop,
  onRestart,
  onDetails,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onClose);
    window.addEventListener("blur", onClose);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("blur", onClose);
    };
  }, [onClose]);

  const left = Math.max(MARGIN, Math.min(x, window.innerWidth - MENU_WIDTH - MARGIN));
  const top = Math.max(MARGIN, Math.min(y, window.innerHeight - MENU_HEIGHT - MARGIN));

  return (
    <div
      ref={ref}
      className="context-menu"
      style={{ left, top }}
      role="menu"
      aria-label={t("processes.menu.title")}
      onContextMenu={(event) => event.preventDefault()}
    >
      <button
        type="button"
        className="context-item danger"
        role="menuitem"
        disabled={!allowed}
        onClick={onStop}
      >
        <Square size={15} strokeWidth={1.75} />
        <span>{t("processes.menu.stop")}</span>
      </button>
      <button
        type="button"
        className="context-item"
        role="menuitem"
        disabled={!allowed}
        onClick={onRestart}
      >
        <RotateCw size={15} strokeWidth={1.75} />
        <span>{t("processes.menu.restart")}</span>
      </button>
      <div className="context-separator" role="separator" />
      <button type="button" className="context-item" role="menuitem" onClick={onDetails}>
        <Info size={15} strokeWidth={1.75} />
        <span>{t("processes.menu.details")}</span>
      </button>
    </div>
  );
}
