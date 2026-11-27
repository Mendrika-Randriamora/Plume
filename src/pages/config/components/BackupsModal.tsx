import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, ConfirmButton, Empty, Loading, Notice, RotateCcw, X } from "@/core/ui";
import { bytes } from "@/core/format";
import i18n from "@/core/i18n";
import { listBackups, restoreBackup } from "../api";
import { formatConfigError } from "../errors";
import type { BackupEntry } from "../types";

interface Props {
  path: string;
  onClose: () => void;
  onRestored: () => void | Promise<void>;
}

function formatStamp(value: number): string {
  return new Intl.DateTimeFormat(i18n.language, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function BackupsModal({ path, onClose, onRestored }: Props) {
  const { t } = useTranslation();
  const [items, setItems] = useState<BackupEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    setItems(null);
    setError(null);
    listBackups(path)
      .then(setItems)
      .catch((reason: unknown) => setError(formatConfigError(reason)));
  }, [path]);

  useEffect(load, [load]);

  const restore = async (id: string) => {
    setBusy(id);
    setError(null);
    try {
      await restoreBackup(path, id);
      await onRestored();
      onClose();
    } catch (reason: unknown) {
      setError(formatConfigError(reason));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal config-modal" onClick={(event) => event.stopPropagation()}>
        <header className="modal-header">
          <div>
            <h2>{t("config.backups.title")}</h2>
            <p className="muted small">{t("config.backups.hint")}</p>
          </div>
          <Button variant="ghost" icon={X} onClick={onClose} aria-label={t("common.close")} />
        </header>
        <div className="modal-content">
          {error && <Notice>{error}</Notice>}
          {!items && !error && <Loading text={t("config.backups.loading")} />}
          {items && items.length === 0 && (
            <Empty icon={RotateCcw} text={t("config.backups.empty")} />
          )}
          {items && items.length > 0 && (
            <ul className="config-backup-list">
              {items.map((item) => (
                <li key={item.id} className="config-backup-row">
                  <div className="grow">
                    <span className="block">{formatStamp(item.created)}</span>
                    <span className="muted small">{bytes(item.size)}</span>
                  </div>
                  <ConfirmButton
                    icon={RotateCcw}
                    label={t("config.backups.restore")}
                    confirmLabel={t("config.actions.confirmRestore")}
                    onConfirm={() => void restore(item.id)}
                    busy={busy === item.id}
                    disabled={busy !== null}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
