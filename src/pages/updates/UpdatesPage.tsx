import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Download, Search } from "lucide-react";
import { Button, Card, ConfirmButton, Empty, Notice, PageHeader } from "@/core/ui";
import { usePermission } from "@/core/settings/SettingsProvider";
import { AppUpdateCard } from "./components/AppUpdateCard";
import { applyUpdates, checkUpdates } from "./api";
import type { UpdateInfo } from "./types";

type Phase = "idle" | "checking" | "ready" | "updating" | "done";

export function UpdatesPage() {
  const { t } = useTranslation();
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
      <PageHeader title={t("updates.title")} subtitle={t("updates.subtitle")} />
      {!allowed && <Notice>{t("common.systemChangesDisabled")}</Notice>}
      {error && <Notice>{error}</Notice>}

      <AppUpdateCard />

      <Card
        title={t("updates.system.title")}
        hint={t("updates.system.hint")}
        action={
          <Button icon={Search} busy={phase === "checking"} disabled={!allowed || phase === "updating"} onClick={search}>
            {t("common.search")}
          </Button>
        }
      >
        {phase === "idle" && <Empty icon={Download} text={t("updates.system.idle")} />}
        {phase === "checking" && <Empty icon={Search} text={t("updates.system.checking")} />}
        {phase === "updating" && <Empty icon={Download} text={t("updates.system.updating")} />}
        {phase === "done" && <Empty icon={CheckCircle2} text={t("updates.system.done")} />}
        {phase === "ready" && info?.manager === "none" && <Empty icon={Search} text={t("common.unsupportedSystem")} />}
        {phase === "ready" && info?.manager !== "none" && items.length === 0 && <Empty icon={CheckCircle2} text={t("updates.system.latest")} />}

        {phase === "ready" && items.length > 0 && (
          <>
            <div className="card-head">
              <p>{t("updates.available", { count: items.length })}</p>
              <ConfirmButton
                label={t("updates.updateAll")}
                confirmLabel={t("updates.updateAllConfirm")}
                icon={Download}
                onConfirm={update}
              />
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
