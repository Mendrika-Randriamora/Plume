import { useTranslation } from "react-i18next";
import { Button, TriangleAlert, X } from "@/core/ui";
import type { StopTarget } from "../types";

interface Props {
  target: StopTarget;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Confirmation explicite avant l'arrêt d'un processus qui tient un port. */
export function StopDialog({ target, busy, onConfirm, onCancel }: Props) {
  const { t } = useTranslation();

  return (
    <div className="modal-overlay" onClick={busy ? undefined : onCancel}>
      <div
        className="modal porter-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="porter-stop-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <h2 id="porter-stop-title">{t("porter.stop.title")}</h2>
          <Button
            variant="ghost"
            icon={X}
            disabled={busy}
            onClick={onCancel}
            aria-label={t("common.close")}
          />
        </header>
        <div className="modal-content">
          <p className="porter-dialog-warning">
            <TriangleAlert size={18} />
            <span>
              {t("porter.stop.description", {
                name: target.name,
                pid: target.pid,
                port: target.port,
              })}
            </span>
          </p>
          <div className="porter-dialog-actions">
            <Button variant="ghost" disabled={busy} onClick={onCancel}>
              {t("common.cancel")}
            </Button>
            <Button busy={busy} onClick={onConfirm}>
              {t("porter.stop.confirm")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
