import { useTranslation } from "react-i18next";
import { Trash2, Info } from "lucide-react";
import { bytes } from "@/core/format";
import { ConfirmButton, Button } from "@/core/ui";
import type { Application } from "../types";

interface Props {
  applications: Application[];
  onUninstall: (desktopId: string) => void;
  onDetails: (desktopId: string) => void;
  onLaunch: (desktopId: string) => void;
  isUninstalling?: string;
  allowed: boolean;
}

export function AppList({ applications, onUninstall, onDetails, onLaunch, isUninstalling, allowed }: Props) {
  const { t } = useTranslation();

  return (
    <ul className="list">
      {applications.map((app) => (
        <li key={app.id}>
          <div className="list-row static">
            <span className="grow">
              <a
                className="ellipsis app-name"
                href="#"
                onClick={(event) => event.preventDefault()}
                onDoubleClick={() => onLaunch(app.id)}
              >
                {app.name}
              </a>
              <span className="muted small ellipsis">
                {app.source === "manuel" ? t("applications.source.manual") : app.source}
              </span>
            </span>
            <span className="nowrap">{app.size === null ? t("common.unknown") : bytes(app.size)}</span>
            <div className="row gap">
              <Button
                variant="ghost"
                icon={Info}
                onClick={() => onDetails(app.id)}
                aria-label={t("applications.details")}
              />
              <ConfirmButton
                label={t("applications.uninstall")}
                onConfirm={() => onUninstall(app.id)}
                disabled={!allowed || isUninstalling !== undefined}
                busy={isUninstalling === app.id}
                icon={Trash2}
                iconOnly
              />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
