import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { PackageCheck } from "lucide-react";
import { Card, ConfirmButton, Empty, Loading } from "@/core/ui";
import { usePermission } from "@/core/settings/SettingsProvider";
import { listObsolete, removeObsolete } from "../api";
import type { ObsoleteInfo } from "../types";

export function ObsoleteCard() {
  const { t } = useTranslation();
  const allowed = usePermission("systemChanges");
  const [info, setInfo] = useState<ObsoleteInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    listObsolete().then(setInfo).catch((e) => setError(e.message));
  }, []);
  useEffect(refresh, [refresh]);

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await removeObsolete();
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const items = info?.items ?? [];
  return (
    <Card
      title={t("home.obsolete.title")}
      hint={t("home.obsolete.hint")}
      action={
        items.length > 0 && allowed ? (
          <ConfirmButton label={t("home.obsolete.remove", { count: items.length })} onConfirm={remove} busy={busy} />
        ) : undefined
      }
    >
      {!info && !error && <Loading />}
      {info && info.manager === "none" && <Empty icon={PackageCheck} text={t("common.unsupportedSystem")} />}
      {info && info.manager !== "none" && items.length === 0 && <Empty icon={PackageCheck} text={t("home.obsolete.empty")} />}
      {items.length > 0 && (
        <p className="chips">
          {items.slice(0, 12).map((n) => (
            <span key={n} className="chip">{n}</span>
          ))}
          {items.length > 12 && (
            <span className="muted small">{t("home.obsolete.more", { count: items.length - 12 })}</span>
          )}
        </p>
      )}
      {items.length > 0 && !allowed && <p className="muted small">{t("common.authorizationDisabled")}</p>}
      {error && <p className="error small">{error}</p>}
    </Card>
  );
}
