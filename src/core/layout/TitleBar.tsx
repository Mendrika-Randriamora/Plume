import { Copy, Minus, Square, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Button } from "@/core/ui";
import { useMaximized } from "./useMaximized";

interface Props {
  /** Titre discret de la page active, sans renvoi avec le logo de la barre latérale. */
  title: string;
}

/** Barre de titre personnalisée : zone de drag, commandes de la fenêtre. */
export function TitleBar({ title }: Props) {
  const { t } = useTranslation();
  const maximized = useMaximized();
  const window = getCurrentWindow();

  const labels = {
    minimize: t("common.minimize"),
    maximize: t("common.maximize"),
    restore: t("common.restore"),
    close: t("common.close"),
  };

  const maximizeIcon = maximized ? Copy : Square;

  return (
    <header className="title-bar" data-tauri-drag-region>
      <div className="title-bar-side" data-tauri-drag-region>
        <span className="title-bar-title" data-tauri-drag-region>
          {title}
        </span>
      </div>
      <div className="title-bar-actions" data-tauri-drag-region>
        <Button
          icon={Minus}
          variant="ghost"
          className="title-bar-btn"
          onClick={() => void window.minimize()}
          aria-label={labels.minimize}
          title={labels.minimize}
        />
        <Button
          icon={maximizeIcon}
          variant="ghost"
          className="title-bar-btn"
          onClick={() => void window.toggleMaximize()}
          aria-label={maximized ? labels.restore : labels.maximize}
          title={maximized ? labels.restore : labels.maximize}
        />
        <Button
          icon={X}
          variant="ghost"
          className="title-bar-btn close"
          onClick={() => void window.close()}
          aria-label={labels.close}
          title={labels.close}
        />
      </div>
    </header>
  );
}
