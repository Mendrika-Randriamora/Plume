import { Trash2, Info } from "lucide-react";
import { bytes } from "@/core/format";
import { ConfirmButton, Button } from "@/core/ui";
import type { Application } from "../types";

interface Props {
  applications: Application[];
  onUninstall: (packageName: string, source: string) => void;
  onDetails: (packageName: string, source: string) => void;
  isUninstalling?: string;
}

export function AppList({ applications, onUninstall, onDetails, isUninstalling }: Props) {
  return (
    <ul className="list">
      {applications.map((app) => (
        <li key={`${app.source}-${app.package_name}`}>
          <div className="list-row static">
            <span className="grow">
              <span className="ellipsis">{app.name}</span>
              <span className="muted small ellipsis">{app.source}</span>
            </span>
            <span className="nowrap">{bytes(app.size)}</span>
            <div className="row gap">
              <ConfirmButton
                label="Désinstaller"
                confirmLabel="Confirmer"
                onConfirm={() => onUninstall(app.package_name, app.source)}
                disabled={isUninstalling === `${app.source}-${app.package_name}`}
                icon={Trash2}
              />
              <Button
                variant="ghost"
                icon={Info}
                onClick={() => onDetails(app.package_name, app.source)}
                aria-label="Voir les détails"
              />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
