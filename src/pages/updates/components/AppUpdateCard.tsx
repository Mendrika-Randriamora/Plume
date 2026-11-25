import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Card, CheckCircle2, Download, Meter, Notice, RefreshCw } from "@/core/ui";
import { formatDate } from "@/core/format";
import { getCurrentVersion } from "@/core/updater";
import { useAppUpdate } from "@/core/updater/useAppUpdate";

/** Mise à jour de Plume elle-même (AppImage), séparée des mises à jour du système. */
export function AppUpdateCard() {
  const { t } = useTranslation();
  const { phase, update, progress, error, allowed, search, install } = useAppUpdate();
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    void getCurrentVersion().then(setVersion);
  }, []);

  return (
    <Card
      title={t("updates.app.title")}
      action={
        <div className="row gap">
          <span className="muted small" title={t("updates.app.installed")}>{version ?? "…"}</span>
          <Button
            variant="ghost"
            className="icon-btn"
            icon={RefreshCw}
            busy={phase === "checking"}
            disabled={!allowed || phase === "installing"}
            onClick={search}
            title={t("common.search")}
            aria-label={t("common.search")}
          />
        </div>
      }
    >
      {phase === "latest" && (
        <p className="small muted row gap">
          <CheckCircle2 size={16} strokeWidth={1.75} /> {t("updates.app.latest")}
        </p>
      )}

      {!allowed && phase !== "installing" && <Notice>{t("common.authorizationDisabled")}</Notice>}

      {error && <Notice>{error}</Notice>}

      {phase === "available" && update && (
        <>
          <div className="field">
            <span>{t("updates.app.newVersion")}</span>
            <span className="muted">{update.version}</span>
          </div>
          {update.date && (
            <div className="field">
              <span>{t("updates.app.published")}</span>
              <span className="muted">{formatDate(update.date)}</span>
            </div>
          )}
          <div className="field col">
            <span>{t("updates.app.notes")}</span>
            <div className="update-notes small">
              {t("updates.app.notesSoon")}
            </div>
          </div>
          <div className="update-action">
            <p className="small muted">{t("updates.app.restart")}</p>
            <Button icon={Download} onClick={install} disabled={!allowed}>{t("updates.app.install")}</Button>
          </div>
        </>
      )}

      {phase === "installing" && (
        <div className="field col">
          <span>
            {progress >= 100
              ? t("updates.app.installing")
              : t("updates.app.downloading", { progress })}
          </span>
          <Meter value={progress} />
          <p className="small muted">{t("updates.app.keepOpen")}</p>
        </div>
      )}
    </Card>
  );
}
