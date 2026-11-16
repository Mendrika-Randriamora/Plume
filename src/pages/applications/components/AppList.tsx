import { Trash2, Info } from "lucide-react";
import { bytes } from "@/core/format";
import { ConfirmButton, Button } from "@/core/ui";
import type { Application } from "../types";

interface Props {
  applications: Application[];
  onUninstall: (desktopId: string) => void;
  onDetails: (desktopId: string) => void;
  isUninstalling?: string;
  allowed: boolean;
}

export function AppList({ applications, onUninstall, onDetails, isUninstalling, allowed }: Props) {
  return (
    <ul className="list">
      {applications.map((app) => (
        <li key={app.id}>
          <div className="list-row static">
            <span className="grow">
              <span className="ellipsis">{app.name}</span>
              <span className="muted small ellipsis">
                {app.source === "manuel" ? "installée manuellement" : app.source}
              </span>
            </span>
            <span className="nowrap">{app.size === null ? "inconnue" : bytes(app.size)}</span>
            <div className="row gap">
              <ConfirmButton
                label="Désinstaller"
                confirmLabel="Confirmer"
                onConfirm={() => onUninstall(app.id)}
                disabled={!allowed || isUninstalling === app.id}
                icon={Trash2}
              />
              <Button
                variant="ghost"
                icon={Info}
                onClick={() => onDetails(app.id)}
                aria-label="Voir les détails"
              />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
