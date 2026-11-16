import { useEffect, useState } from "react";
import { CheckCircle2, Download, Search } from "lucide-react";
import { Button, Card, Meter, Notice } from "@/core/ui";
import { getCurrentVersion } from "@/core/updater";
import { useAppUpdate } from "@/core/updater/useAppUpdate";

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

/** Mise à jour de Plume elle-même (AppImage), séparée des mises à jour du système. */
export function AppUpdateCard() {
  const { phase, update, progress, error, search, install } = useAppUpdate();
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    void getCurrentVersion().then(setVersion);
  }, []);

  return (
    <Card
      title="Mise à jour de l'application"
      hint="Plume se met à jour sans réinstallation. Vous choisissez le moment."
      action={
        <Button icon={Search} busy={phase === "checking"} disabled={phase === "installing"} onClick={search}>
          Rechercher
        </Button>
      }
    >
      <div className="field">
        <span>Version installée</span>
        <span className="muted">{version ?? "…"}</span>
      </div>

      {phase === "idle" && (
        <p className="small muted">Cliquez sur « Rechercher » pour vérifier s{`'`}il existe une version plus récente.</p>
      )}

      {phase === "latest" && (
        <p className="small muted row gap">
          <CheckCircle2 size={16} strokeWidth={1.75} /> Plume est à jour.
        </p>
      )}

      {error && <Notice>{error}</Notice>}

      {phase === "available" && update && (
        <>
          <div className="field">
            <span>Nouvelle version</span>
            <span className="muted">{update.version}</span>
          </div>
          {update.date && (
            <div className="field">
              <span>Publiée le</span>
              <span className="muted">{formatDate(update.date)}</span>
            </div>
          )}
          <div className="field col">
            <span>Notes de version</span>
            <div className="update-notes small">
              Les notes de mise à jour seront bientôt disponibles.
            </div>
          </div>
          <div className="update-action">
            <p className="small muted">Plume va redémarrer pour terminer l{`'`}installation.</p>
            <Button icon={Download} onClick={install}>Installer et redémarrer</Button>
          </div>
        </>
      )}

      {phase === "installing" && (
        <div className="field col">
          <span>{progress >= 100 ? "Installation en cours…" : `Téléchargement… ${progress} %`}</span>
          <Meter value={progress} />
          <p className="small muted">Ne fermez pas Plume pendant la mise à jour.</p>
        </div>
      )}
    </Card>
  );
}
