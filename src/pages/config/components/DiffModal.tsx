import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Button, Notice, X } from "@/core/ui";
import { diffLines, MAX_DIFF_LINES } from "../diff";

interface Props {
  before: string;
  after: string;
  onClose: () => void;
}

export function DiffModal({ before, after, onClose }: Props) {
  const { t } = useTranslation();
  const result = useMemo(() => diffLines(before, after), [before, after]);
  const changes = result.lines.filter((line) => line.kind !== "same").length;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal config-modal wide" onClick={(event) => event.stopPropagation()}>
        <header className="modal-header">
          <div>
            <h2>{t("config.diff.title")}</h2>
            <p className="muted small">{t("config.diff.hint")}</p>
          </div>
          <Button variant="ghost" icon={X} onClick={onClose} aria-label={t("common.close")} />
        </header>
        <div className="modal-content">
          {result.truncated ? (
            <Notice>{t("config.diff.tooLarge", { count: MAX_DIFF_LINES })}</Notice>
          ) : changes === 0 ? (
            <div className="empty">
              <p>{t("config.diff.empty")}</p>
            </div>
          ) : (
            <pre className="config-diff">
              {result.lines.map((line, index) => (
                <span key={index} className={`config-diff-line ${line.kind}`}>
                  <span className="config-diff-sign">
                    {line.kind === "add" ? "+" : line.kind === "remove" ? "−" : " "}
                  </span>
                  {line.text || " "}
                  {"\n"}
                </span>
              ))}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
