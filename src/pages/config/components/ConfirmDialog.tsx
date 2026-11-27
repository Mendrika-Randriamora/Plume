import { useTranslation } from "react-i18next";
import { Button, X } from "@/core/ui";

interface Props {
  title: string;
  text: string;
  confirmLabel: string;
  busy?: boolean;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  text,
  confirmLabel,
  busy,
  danger,
  onConfirm,
  onCancel,
}: Props) {
  const { t } = useTranslation();

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal config-modal" onClick={(event) => event.stopPropagation()}>
        <header className="modal-header">
          <h2>{title}</h2>
          <Button variant="ghost" icon={X} onClick={onCancel} aria-label={t("common.close")} />
        </header>
        <div className="modal-content">
          <p className={danger ? "config-confirm-danger" : undefined}>{text}</p>
          <div className="config-modal-actions">
            <Button variant="ghost" onClick={onCancel} disabled={busy}>
              {t("config.actions.cancel")}
            </Button>
            <Button onClick={onConfirm} busy={busy}>
              {confirmLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
