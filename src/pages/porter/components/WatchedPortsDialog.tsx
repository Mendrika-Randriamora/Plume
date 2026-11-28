import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Plus, RotateCcw, Trash2, X } from "@/core/ui";
import { serviceKey } from "../services";
import type { WatchedPort } from "../types";

interface Props {
  watched: WatchedPort[];
  onAdd: (port: number, label: string | null) => boolean;
  onRemove: (port: number) => void;
  onLabel: (port: number, label: string | null) => void;
  onReset: () => void;
  onClose: () => void;
}

/** Réglages de la page : liste des ports surveillés et de leurs étiquettes. */
export function WatchedPortsDialog({
  watched,
  onAdd,
  onRemove,
  onLabel,
  onReset,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const [port, setPort] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);

  const defaultLabel = (item: WatchedPort) => {
    const key = serviceKey(item.port);
    return key ? t(key) : t("porter.settings.defaultLabel");
  };

  const add = () => {
    const value = Number(port);
    if (!Number.isInteger(value) || value < 1 || value > 65535) {
      setError(t("porter.settings.invalid"));
      return;
    }
    if (watched.some((item) => item.port === value) || !onAdd(value, label.trim() || null)) {
      setError(t("porter.settings.duplicate"));
      return;
    }
    setPort("");
    setLabel("");
    setError(null);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal porter-dialog porter-watched"
        role="dialog"
        aria-modal="true"
        aria-labelledby="porter-watched-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <div>
            <h2 id="porter-watched-title">{t("porter.settings.title")}</h2>
            <p className="muted small">{t("porter.settings.hint")}</p>
          </div>
          <Button
            variant="ghost"
            icon={X}
            onClick={onClose}
            aria-label={t("common.close")}
          />
        </header>

        <div className="modal-content">
          <form
            className="porter-add"
            onSubmit={(event) => {
              event.preventDefault();
              add();
            }}
          >
            <input
              className="text-input porter-port-input"
              type="number"
              min={1}
              max={65535}
              value={port}
              onChange={(event) => setPort(event.target.value)}
              placeholder={t("porter.settings.addPlaceholder")}
              aria-label={t("porter.settings.addPlaceholder")}
            />
            <input
              className="text-input"
              type="text"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder={t("porter.settings.labelPlaceholder")}
              aria-label={t("porter.settings.labelPlaceholder")}
            />
            <Button type="submit" icon={Plus}>
              {t("porter.settings.add")}
            </Button>
          </form>

          {error && <p className="error small">{error}</p>}

          {watched.length === 0 ? (
            <p className="muted small">{t("porter.settings.empty")}</p>
          ) : (
            <ul className="list porter-watched-list">
              {watched.map((item) => (
                <li key={item.port} className="porter-watched-row">
                  <span className="porter-port">{item.port}</span>
                  <input
                    className="text-input"
                    type="text"
                    value={item.label ?? ""}
                    placeholder={defaultLabel(item)}
                    onChange={(event) =>
                      onLabel(item.port, event.target.value.trim() ? event.target.value : null)
                    }
                    aria-label={t("porter.settings.labelPlaceholder")}
                  />
                  <Button
                    variant="ghost"
                    icon={Trash2}
                    className="icon-btn"
                    onClick={() => onRemove(item.port)}
                    aria-label={t("porter.settings.remove", { port: item.port })}
                    title={t("porter.settings.remove", { port: item.port })}
                  />
                </li>
              ))}
            </ul>
          )}

          <div className="porter-watched-foot">
            <Button variant="ghost" icon={RotateCcw} onClick={onReset}>
              {t("porter.settings.reset")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
