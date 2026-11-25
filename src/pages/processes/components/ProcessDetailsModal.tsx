import { useTranslation } from "react-i18next";
import { Button, Loading, X } from "@/core/ui";
import { bytes, percentValue } from "@/core/format";
import type { ProcessDetails } from "../types";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  details: ProcessDetails | null;
  loading: boolean;
  error: string | null;
}

const STATUS_KEYS = {
  Run: "processes.status.run",
  Sleep: "processes.status.sleep",
  Idle: "processes.status.idle",
  Stop: "processes.status.stop",
  Zombie: "processes.status.zombie",
  Dead: "processes.status.dead",
  Tracing: "processes.status.tracing",
  Wakekill: "processes.status.wakekill",
  Waking: "processes.status.waking",
  Parked: "processes.status.parked",
  LockBlocked: "processes.status.lockBlocked",
  UninterruptibleDiskSleep: "processes.status.diskSleep",
} as const;

function uptime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return [hours, minutes, secs].map((value) => String(value).padStart(2, "0")).join(":");
}

export function ProcessDetailsModal({ isOpen, onClose, details, loading, error }: Props) {
  const { t, i18n } = useTranslation();
  if (!isOpen) return null;

  const statusKey = details
    ? STATUS_KEYS[details.status as keyof typeof STATUS_KEYS]
    : undefined;
  const status = statusKey ? t(statusKey) : (details?.status ?? "");

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <header className="modal-header">
          <h2>{t("processes.details.title")}</h2>
          <Button variant="ghost" icon={X} onClick={onClose} aria-label={t("common.close")} />
        </header>

        {loading && !details ? (
          <Loading text={t("processes.details.loading")} />
        ) : details ? (
          <div className="modal-content">
            <div className="detail-grid">
              <div className="detail-item">
                <span className="detail-label">{t("processes.details.name")}</span>
                <span className="detail-value">{details.name}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">{t("processes.details.pid")}</span>
                <span className="detail-value">{details.pid}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">{t("processes.details.parent")}</span>
                <span className="detail-value">{details.parent ?? "—"}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">{t("processes.details.user")}</span>
                <span className="detail-value">{details.user || details.userId || "—"}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">{t("processes.details.status")}</span>
                <span className="detail-value">{status}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">{t("processes.details.cpu")}</span>
                <span className="detail-value">{percentValue(details.cpu, 1)}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">{t("processes.details.memory")}</span>
                <span className="detail-value">{bytes(details.memory)}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">{t("processes.details.started")}</span>
                <span className="detail-value">
                  {details.startTime
                    ? new Date(details.startTime * 1000).toLocaleString(i18n.language)
                    : "—"}
                </span>
              </div>
              <div className="detail-item">
                <span className="detail-label">{t("processes.details.uptime")}</span>
                <span className="detail-value">{uptime(details.runTime)}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">{t("processes.details.read")}</span>
                <span className="detail-value">{bytes(details.read)}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">{t("processes.details.write")}</span>
                <span className="detail-value">{bytes(details.write)}</span>
              </div>
              <div className="detail-item full-width">
                <span className="detail-label">{t("processes.details.exe")}</span>
                <span className="detail-value muted process-path">{details.exe || "—"}</span>
              </div>
              <div className="detail-item full-width">
                <span className="detail-label">{t("processes.details.cwd")}</span>
                <span className="detail-value muted process-path">{details.cwd || "—"}</span>
              </div>
              <div className="detail-item full-width">
                <span className="detail-label">{t("processes.details.cmd")}</span>
                <span className="detail-value muted process-path">{details.cmd || "—"}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="empty">
            <p>{error ?? t("processes.details.error")}</p>
          </div>
        )}
      </div>
    </div>
  );
}
