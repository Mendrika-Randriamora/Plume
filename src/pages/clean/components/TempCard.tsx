import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Sparkles, Trash2 } from "lucide-react";
import { bytes } from "@/core/format";
import { Card, ConfirmButton, Empty, Loading } from "@/core/ui";
import { usePermission } from "@/core/settings/SettingsProvider";
import { clearTemp, scanTemp, type TempItem } from "../api";

export function TempCard() {
  const { t } = useTranslation();
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
      title={t("clean.temp.title")}
      hint={t("clean.temp.hint")}
      action={
        items && items.length > 0 && allowed ? (
          <ConfirmButton
            label={t("clean.temp.clear", { size: bytes(total) })}
            confirmLabel={t("clean.temp.clearConfirm")}
            icon={Trash2}
            iconOnly
            onConfirm={clear}
            busy={busy}
          />
        ) : undefined
      }
    >
      {!items && !error && <Loading />}
      {items && items.length === 0 && <Empty icon={Sparkles} text={t("clean.temp.empty")} />}
      {items && items.length > 0 && (
        <ul className="list">
          {items.map((i) => (
            <li key={i.id} className="list-row static">
              <span className="grow ellipsis">
                {i.kind === "trash" ? t("clean.temp.trash") : t("clean.temp.cache", { name: i.name ?? "" })}
              </span>
              <span>{bytes(i.size)}</span>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="error small">{error}</p>}
    </Card>
  );
}
