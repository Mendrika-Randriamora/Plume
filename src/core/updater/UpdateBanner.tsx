import { useTranslation } from "react-i18next";
import { Download } from "@/core/ui";
import { useNav } from "@/core/layout/nav";
import { useAppUpdate } from "./useAppUpdate";

/** Bandeau discret affiché uniquement quand une nouvelle version de Plume existe. */
export function UpdateBanner() {
  const { t } = useTranslation();
  const { phase, update } = useAppUpdate(true);
  const { go } = useNav();

  if (phase !== "available" || !update) return null;

  return (
    <button className="notice update-banner row gap" onClick={() => go("updates")}>
      <Download size={16} strokeWidth={1.75} />
      <span className="grow">{t("updater.banner.available", { version: update.version })}</span>
      <span className="small muted nowrap">{t("updater.banner.view")}</span>
    </button>
  );
}
