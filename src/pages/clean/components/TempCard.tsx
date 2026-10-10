import { useCallback, useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { bytes } from "@/core/format";
import { Card, ConfirmButton, Empty, Loading } from "@/core/ui";
import { usePermission } from "@/core/settings/SettingsProvider";
import { clearTemp, scanTemp, type TempItem } from "../api";

export function TempCard() {
  const allowed = usePermission("deleteFiles");
  const [items, setItems] = useState<TempItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    scanTemp().then(setItems).catch((e) => setError(e.message));
  }, []);
  useEffect(refresh, [refresh]);

  const total = (items ?? []).reduce((s, i) => s + i.size, 0);

  const clear = async () => {
    setBusy(true);
    try {
      await clearTemp((items ?? []).map((i) => i.path));
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      title="Fichiers temporaires"
      hint="Caches des programmes et corbeille. Ils se recréent tout seuls si besoin."
      action={
        items && items.length > 0 && allowed ? (
          <ConfirmButton label={`Vider (${bytes(total)})`} confirmLabel="Oui, vider" onConfirm={clear} busy={busy} />
        ) : undefined
      }
    >
      {!items && !error && <Loading />}
      {items && items.length === 0 && <Empty icon={Sparkles} text="Aucun fichier temporaire volumineux." />}
      {items && items.length > 0 && (
        <ul className="list">
          {items.map((i) => (
            <li key={i.id} className="list-row static">
              <span className="grow ellipsis">{i.label}</span>
              <span>{bytes(i.size)}</span>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="error small">{error}</p>}
    </Card>
  );
}
