import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { PackageCheck, Trash2 } from "@/core/ui";
import { Card, ConfirmButton, Empty, Loading } from "@/core/ui";
import { usePermission } from "@/core/settings/SettingsProvider";
import { removeObsolete } from "../api";
import { loadObsolete, useHomeLive } from "../live";

export function ObsoleteCard() {
  const { t } = useTranslation();
  const allowed = usePermission("systemChanges");
  const { obsolete: info } = useHomeLive();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Liste mise en cache par le magasin partagé : pas de nouvel appel au
  // gestionnaire de paquets à chaque retour sur la page.
  useEffect(() => {
    void loadObsolete();
  }, []);

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await removeObsolete();
      await loadObsolete(true);
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
          <ConfirmButton label={t("home.obsolete.remove", { count: items.length })} icon={Trash2} iconOnly onConfirm={remove} busy={busy} />
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
