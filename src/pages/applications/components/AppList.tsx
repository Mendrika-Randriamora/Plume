import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();

  return (
    <ul className="list">
      {applications.map((app) => (
        <li key={app.id}>
          <div className="list-row static">
            <span className="grow">
              <span className="ellipsis">{app.name}</span>
              <span className="muted small ellipsis">
                {app.source === "manuel" ? t("applications.source.manual") : app.source}
              </span>
            </span>
            <span className="nowrap">{app.size === null ? t("common.unknown") : bytes(app.size)}</span>
            <div className="row gap">
              <ConfirmButton
                label={t("applications.uninstall")}
                onConfirm={() => onUninstall(app.id)}
                disabled={!allowed || isUninstalling === app.id}
                icon={Trash2}
              />
              <Button
                variant="ghost"
                icon={Info}
                onClick={() => onDetails(app.id)}
                aria-label={t("applications.details")}
              />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
