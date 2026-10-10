import { useCallback, useEffect, useState } from "react";
import { PackageCheck } from "lucide-react";
import { Card, ConfirmButton, Empty, Loading } from "@/core/ui";
import { usePermission } from "@/core/settings/SettingsProvider";
import { listObsolete, removeObsolete } from "../api";
import type { ObsoleteInfo } from "../types";

export function ObsoleteCard() {
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
      title="Programmes devenus inutiles"
      hint="Installés pour d'autres programmes qui ont disparu depuis. Les retirer libère de la place sans rien casser."
      action={
        items.length > 0 && allowed ? (
          <ConfirmButton label={`Supprimer (${items.length})`} onConfirm={remove} busy={busy} />
        ) : undefined
      }
    >
      {!info && !error && <Loading />}
      {info && info.manager === "none" && <Empty icon={PackageCheck} text="Votre système n'est pas encore pris en charge." />}
      {info && info.manager !== "none" && items.length === 0 && <Empty icon={PackageCheck} text="Tout est propre, rien à retirer." />}
      {items.length > 0 && (
        <p className="chips">
          {items.slice(0, 12).map((n) => (
            <span key={n} className="chip">{n}</span>
          ))}
          {items.length > 12 && <span className="muted small">+ {items.length - 12} autres</span>}
        </p>
      )}
      {items.length > 0 && !allowed && <p className="muted small">Autorisation désactivée dans les Réglages.</p>}
      {error && <p className="error small">{error}</p>}
    </Card>
  );
}
