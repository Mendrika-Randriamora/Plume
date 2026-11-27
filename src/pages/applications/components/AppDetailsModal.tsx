import { useTranslation } from "react-i18next";
import { Button, Loading, X } from "@/core/ui";
import { bytes } from "@/core/format";
import type { ApplicationDetails } from "../types";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  details: ApplicationDetails | null;
  loading: boolean;
}

export function AppDetailsModal({ isOpen, onClose, details, loading }: Props) {
  const { t } = useTranslation();
  if (!isOpen) return null;

  const sourceLabel = (source: ApplicationDetails["source"]) =>
    source === "manuel"
      ? t("applications.source.manual")
      : source === "windows"
        ? t("applications.source.windows")
        : source;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2>{t("applications.modal.title")}</h2>
          <Button variant="ghost" icon={X} onClick={onClose} aria-label={t("common.close")} />
        </header>

        {loading && !details ? (
          <Loading text={t("applications.modal.loading")} />
        ) : details ? (
          <div className="modal-content">
            <div className="detail-grid">
              <div className="detail-item">
                <span className="detail-label">{t("applications.modal.name")}</span>
                <span className="detail-value">{details.name}</span>
              </div>
              {details.package_name && (
                <div className="detail-item">
                  <span className="detail-label">{t("applications.modal.package")}</span>
                  <span className="detail-value muted">{details.package_name}</span>
                </div>
              )}
              <div className="detail-item">
                <span className="detail-label">{t("applications.modal.source")}</span>
                <span className="detail-value">{sourceLabel(details.source)}</span>
              </div>
              {details.version && (
                <div className="detail-item">
                  <span className="detail-label">{t("applications.modal.version")}</span>
                  <span className="detail-value">{details.version}</span>
                </div>
              )}
              <div className="detail-item">
                <span className="detail-label">{t("applications.modal.size")}</span>
                <span className="detail-value">
                  {details.size === null ? t("common.unknown") : bytes(details.size)}
                </span>
              </div>
              {details.description && (
                <div className="detail-item full-width">
                  <span className="detail-label">{t("applications.modal.description")}</span>
                  <span className="detail-value">{details.description}</span>
                </div>
              )}
              {details.exec && (
                <div className="detail-item full-width">
                  <span className="detail-label">{t("applications.modal.exec")}</span>
                  <span className="detail-value muted">{details.exec}</span>
                </div>
              )}
              {details.icon && (
                <div className="detail-item">
                  <span className="detail-label">{t("applications.modal.icon")}</span>
                  <span className="detail-value muted">{details.icon}</span>
                </div>
              )}
              {details.categories && details.categories.length > 0 && (
                <div className="detail-item full-width">
                  <span className="detail-label">{t("applications.modal.categories")}</span>
                  <span className="detail-value">
                    {details.categories.map((c, i) => (
                      <span key={i}>
                        {i > 0 ? ", " : ""}
                        {c}
                      </span>
                    ))}
                  </span>
                </div>
              )}
              {details.desktop_file && (
                <div className="detail-item full-width">
                  <span className="detail-label">{t("applications.modal.desktopFile")}</span>
                  <span className="detail-value muted">{details.desktop_file}</span>
                </div>
              )}
            </div>

            {details.source === "manuel" && (
              <p className="muted small">
                {t("applications.modal.manualNote")}
              </p>
            )}

            {details.desktop_content && (
              <div className="desktop-content">
                <h3>{t("applications.modal.desktopContent")}</h3>
                <pre className="desktop-pre">{details.desktop_content}</pre>
              </div>
            )}
          </div>
        ) : (
          <div className="empty">
            <p>{t("applications.modal.error")}</p>
          </div>
        )}
      </div>
    </div>
  );
}
