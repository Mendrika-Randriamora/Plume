import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileText, Folder, FolderOpen, Trash2 } from "lucide-react";
import { ago, bytes } from "@/core/format";
import { Button, Card, ConfirmButton, Empty, Loading, Notice, PageHeader } from "@/core/ui";
import { usePermission } from "@/core/settings/SettingsProvider";
import type { FileEntry } from "@/pages/home/types";
import { deleteToTrash, reveal, scanClean, type CleanFilter } from "./api";
import { TempCard } from "./components/TempCard";

const FILTERS = [
  { id: "unused", labelKey: "clean.filters.unused" },
  { id: "largest", labelKey: "clean.filters.largest" },
] as const;

export function CleanPage() {
  const { t } = useTranslation();
  const canScan = usePermission("scanHome");
  const canDelete = usePermission("deleteFiles");
  const [filter, setFilter] = useState<CleanFilter>("unused");
  const [onlyFiles, setOnlyFiles] = useState(true);
  const [rows, setRows] = useState<FileEntry[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!canScan) return;
    setRows(null);
    setPicked(new Set());
    scanClean(filter, onlyFiles).then(setRows).catch((e) => setError(e.message));
  }, [filter, onlyFiles, canScan]);
  useEffect(load, [load]);

  const toggle = (p: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(p)) {
        n.delete(p);
      } else {
        n.add(p);
      }
      return n;
    });

  const pickedSize = useMemo(
    () => (rows ?? []).filter((r) => picked.has(r.path)).reduce((s, r) => s + r.size, 0),
    [rows, picked],
  );

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteToTrash([...picked]);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title={t("clean.title")} subtitle={t("clean.subtitle")} />
      {error && <Notice>{error}</Notice>}

      <TempCard />

      <Card title={t("clean.files.title")}>
        <div className="toolbar">
          <div className="seg">
            {FILTERS.map((f) => (
              <button key={f.id} className={filter === f.id ? "on" : ""} onClick={() => setFilter(f.id)}>
                {t(f.labelKey)}
              </button>
            ))}
          </div>
          <label className="check">
            <input type="checkbox" checked={onlyFiles} onChange={(e) => setOnlyFiles(e.target.checked)} />
            {t("clean.files.onlyFiles")}
          </label>
        </div>

        {!canScan && <Empty icon={FolderOpen} text={t("clean.scanDisabled")} />}
        {canScan && !rows && <Loading text={t("clean.loading")} />}
        {rows && rows.length === 0 && <Empty icon={FolderOpen} text={t("clean.empty")} />}
        {rows && rows.length > 0 && (
          <ul className="list">
            {rows.map((r) => (
              <li key={r.path} className="list-row static">
                <input
                  type="checkbox"
                  checked={picked.has(r.path)}
                  onChange={() => toggle(r.path)}
                  aria-label={t("clean.select", { name: r.name })}
                />
                {r.isDir ? <Folder size={16} strokeWidth={1.75} /> : <FileText size={16} strokeWidth={1.75} />}
                <span className="grow">
                  <span className="ellipsis">{r.name}</span>
                  <span className="muted small ellipsis">{r.parent}</span>
                </span>
                <span className="muted small nowrap">{ago(r.lastUsed)}</span>
                <span className="nowrap">{bytes(r.size)}</span>
                <Button
                  variant="ghost"
                  icon={FolderOpen}
                  aria-label={t("common.openFolder")}
                  onClick={() => reveal(r.path)}
                />
              </li>
            ))}
          </ul>
        )}

        {picked.size > 0 && canDelete && (
          <div className="actionbar">
            <span>{t("clean.selected", { count: picked.size, size: bytes(pickedSize) })}</span>
            <ConfirmButton
              icon={Trash2}
              label={t("clean.trash")}
              confirmLabel={t("clean.trashConfirm")}
              onConfirm={remove}
              busy={busy}
            />
          </div>
        )}
        {picked.size > 0 && !canDelete && <p className="muted small">{t("common.deleteDisabled")}</p>}
      </Card>
    </>
  );
}
