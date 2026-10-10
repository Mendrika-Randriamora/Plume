import { useState } from "react";
import { CheckCircle2, Download, Search } from "lucide-react";
import { Button, Card, ConfirmButton, Empty, Notice, PageHeader } from "@/core/ui";
import { usePermission } from "@/core/settings/SettingsProvider";
import { applyUpdates, checkUpdates } from "./api";
import type { UpdateInfo } from "./types";

type Phase = "idle" | "checking" | "ready" | "updating" | "done";

export function UpdatesPage() {
  const allowed = usePermission("systemChanges");
  const [phase, setPhase] = useState<Phase>("idle");
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const search = async () => {
    setPhase("checking");
    setError(null);
    try {
      setInfo(await checkUpdates(true));
      setPhase("ready");
    } catch (e) {
      setError((e as Error).message);
      setPhase("idle");
    }
  };

  const update = async () => {
    setPhase("updating");
    setError(null);
    try {
      await applyUpdates();
      setInfo({ ...(info as UpdateInfo), items: [] });
      setPhase("done");
    } catch (e) {
      setError((e as Error).message);
      setPhase("ready");
    }
  };

  const items = info?.items ?? [];

  return (
    <>
      <PageHeader
        title="Mises à jour"
        subtitle="Gardez votre système à jour et sécurisé."
        action={
          <Button icon={Search} busy={phase === "checking"} disabled={!allowed || phase === "updating"} onClick={search}>
            Rechercher
          </Button>
        }
      />
      {!allowed && <Notice>Les modifications du système sont désactivées dans les Réglages.</Notice>}
      {error && <Notice>{error}</Notice>}

      <Card>
        {phase === "idle" && <Empty icon={Download} text="Cliquez sur « Rechercher ». Votre mot de passe sera demandé une seule fois." />}
        {phase === "checking" && <Empty icon={Search} text="Recherche en cours…" />}
        {phase === "updating" && <Empty icon={Download} text="Mise à jour en cours, ne fermez pas Plume…" />}
        {phase === "done" && <Empty icon={CheckCircle2} text="Tout est à jour. Un redémarrage peut être utile." />}
        {phase === "ready" && info?.manager === "none" && <Empty icon={Search} text="Votre système n'est pas encore pris en charge." />}
        {phase === "ready" && info?.manager !== "none" && items.length === 0 && <Empty icon={CheckCircle2} text="Tout est à jour." />}

        {phase === "ready" && items.length > 0 && (
          <>
            <div className="card-head">
              <p>{items.length} mise{items.length > 1 ? "s" : ""} à jour disponible{items.length > 1 ? "s" : ""}</p>
              <ConfirmButton label="Tout mettre à jour" confirmLabel="Oui, mettre à jour" icon={Download} onConfirm={update} />
            </div>
            <ul className="list">
              {items.map((p) => (
                <li key={p.name} className="list-row static">
                  <span className="grow ellipsis">{p.name}</span>
                  <span className="muted small nowrap">{[p.from, p.to].filter(Boolean).join(" → ")}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </>
  );
}
