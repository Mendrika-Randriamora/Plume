import { Download } from "lucide-react";
import { useNav } from "@/core/layout/nav";
import { useAppUpdate } from "./useAppUpdate";

/** Bandeau discret affiché uniquement quand une nouvelle version de Plume existe. */
export function UpdateBanner() {
  const { phase, update } = useAppUpdate(true);
  const { go } = useNav();

  if (phase !== "available" || !update) return null;

  return (
    <button className="notice update-banner row gap" onClick={() => go("updates")}>
      <Download size={16} strokeWidth={1.75} />
      <span className="grow">
        Plume {update.version} est disponible. Vous choisissez quand l{`'`}installer.
      </span>
      <span className="small muted nowrap">Voir la mise à jour →</span>
    </button>
  );
}
