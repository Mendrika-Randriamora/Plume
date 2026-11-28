import { useTranslation } from "react-i18next";
import { Button, ShieldCheck, X } from "@/core/ui";
import { Pin, PinOff } from "../icons";
import type { StopTarget, WatchedRow } from "../types";

const STATUS_KEYS = {
  free: "porter.status.free",
  busy: "porter.status.busy",
  system: "porter.status.system",
} as const;

interface Props {
  row: WatchedRow;
  label: string;
  pinned: boolean;
  allowed: boolean;
  onTogglePin: (port: number) => void;
  onStop: (target: StopTarget) => void;
}

export function PortRow({ row, label, pinned, allowed, onTogglePin, onStop }: Props) {
  const { t } = useTranslation();
  const owner = row.representative;
  const stoppable = row.status === "busy" ? row.stoppable : null;
  const stopPid = stoppable?.pid ?? null;

  return (
    <div className={`porter-row ${pinned ? "pinned" : ""}`}>
      <button
        type="button"
        className={`porter-pin ${pinned ? "pinned" : ""}`}
        onClick={() => onTogglePin(row.watched.port)}
        title={t(pinned ? "porter.pin.unpin" : "porter.pin.pin", { port: row.watched.port })}
        aria-label={t(pinned ? "porter.pin.unpin" : "porter.pin.pin", { port: row.watched.port })}
        aria-pressed={pinned}
      >
        {pinned ? <PinOff size={14} /> : <Pin size={14} />}
      </button>

      <span className="porter-port">{row.watched.port}</span>
      <span className="porter-service ellipsis" title={label}>{label}</span>
      <span className={`porter-badge ${row.status}`}>
        <span className={`porter-dot ${row.status}`} />
        {t(STATUS_KEYS[row.status])}
      </span>

      <span className="porter-process">
        {owner ? (
          <>
            <span className="ellipsis" title={owner.process ?? ""}>
              {owner.process ?? t("porter.process.unknown")}
            </span>
            {owner.pid !== null && (
              <span className="muted small nowrap">
                {t("porter.process.pid", { pid: owner.pid })}
              </span>
            )}
          </>
        ) : (
          <span className="muted small">—</span>
        )}
      </span>

      <span className="porter-actions">
        {stoppable && stopPid !== null ? (
          <Button
            variant="ghost"
            icon={X}
            className="icon-btn porter-stop"
            disabled={!allowed}
            onClick={() =>
              onStop({
                pid: stopPid,
                port: row.watched.port,
                name: stoppable.process ?? t("porter.process.unknown"),
              })
            }
            aria-label={t("porter.stop.aria", { port: row.watched.port })}
            title={t("porter.stop.aria", { port: row.watched.port })}
          />
        ) : row.status === "system" ? (
          <span
            className="porter-protected"
            title={t("porter.process.systemHint")}
            aria-label={t("porter.process.systemHint")}
          >
            <ShieldCheck size={15} />
          </span>
        ) : (
          <span className="muted small">—</span>
        )}
      </span>
    </div>
  );
}
