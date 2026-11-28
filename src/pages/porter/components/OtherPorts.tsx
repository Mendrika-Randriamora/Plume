import { useTranslation } from "react-i18next";
import { Button, Card, ChevronDown, ChevronRight, ShieldCheck, X } from "@/core/ui";
import type { PortEntry, StopTarget } from "../types";

interface Props {
  open: boolean;
  onToggle: () => void;
  rows: PortEntry[];
  includeOutgoing: boolean;
  onIncludeOutgoing: (value: boolean) => void;
  allowed: boolean;
  onStop: (target: StopTarget) => void;
  search: string;
}

/** Section dépliable : tous les ports qui ne sont pas dans la liste surveillée. */
export function OtherPorts({
  open,
  onToggle,
  rows,
  includeOutgoing,
  onIncludeOutgoing,
  allowed,
  onStop,
  search,
}: Props) {
  const { t } = useTranslation();

  return (
    <Card>
      <div className="porter-other-head">
        <button
          type="button"
          className="section-head porter-other-toggle"
          onClick={onToggle}
          aria-expanded={open}
        >
          {open ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
          <span>
            <span className="settings-row-title">{t("porter.other.title")}</span>
            <span className="muted small block">{t("porter.other.hint")}</span>
          </span>
        </button>
        <span className="chip muted small">{t("porter.other.count", { count: rows.length })}</span>
      </div>

      {open && (
        <div className="porter-other">
          <label className="check small">
            <input
              type="checkbox"
              checked={includeOutgoing}
              onChange={(event) => onIncludeOutgoing(event.target.checked)}
            />
            {t("porter.other.includeOutgoing")}
          </label>

          {rows.length === 0 ? (
            <p className="muted small">
              {search ? t("porter.other.filteredEmpty") : t("porter.other.empty")}
            </p>
          ) : (
            <div className="porter-other-list">
              {rows.map((entry, index) => (
                <div
                  className="porter-other-row"
                  key={`${entry.protocol}-${entry.address}-${entry.port}-${entry.pid ?? "none"}-${index}`}
                >
                  <span className={`chip porter-proto ${entry.protocol}`}>{entry.protocol}</span>
                  <span className="porter-port">{entry.port}</span>
                  <span
                    className="muted small ellipsis porter-other-address"
                    title={`${entry.address} → ${entry.remote}`}
                  >
                    {entry.address}
                  </span>
                  <span className="porter-other-process">
                    <span className="ellipsis" title={entry.process ?? ""}>
                      {entry.process ?? t("porter.process.unknown")}
                    </span>
                    {!entry.listening && (
                      <span className="chip muted small">{t("porter.other.outgoing")}</span>
                    )}
                  </span>
                  <span className="muted small nowrap porter-other-pid">
                    {entry.pid !== null
                      ? t("porter.process.pid", { pid: entry.pid })
                      : "—"}
                  </span>
                  {entry.system ? (
                    <span
                      className="porter-protected"
                      title={t("porter.process.systemHint")}
                      aria-label={t("porter.process.systemHint")}
                    >
                      <ShieldCheck size={14} />
                    </span>
                  ) : entry.pid !== null ? (
                    <Button
                      variant="ghost"
                      icon={X}
                      className="icon-btn porter-stop"
                      disabled={!allowed}
                      onClick={() =>
                        onStop({
                          pid: entry.pid as number,
                          port: entry.port,
                          name: entry.process ?? t("porter.process.unknown"),
                        })
                      }
                      aria-label={t("porter.stop.aria", { port: entry.port })}
                      title={t("porter.stop.aria", { port: entry.port })}
                    />
                  ) : (
                    <span className="muted small">—</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
