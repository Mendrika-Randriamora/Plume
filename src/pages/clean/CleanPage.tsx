import { useCallback, useEffect, useMemo, useState } from "react";
import { FileText, Folder, FolderOpen, Trash2 } from "lucide-react";
import { ago, bytes } from "@/core/format";
import { Button, Card, ConfirmButton, Empty, Loading, Notice, PageHeader } from "@/core/ui";
import { usePermission } from "@/core/settings/SettingsProvider";
import type { FileEntry } from "@/pages/home/types";
import { deleteToTrash, reveal, scanClean, type CleanFilter } from "./api";
import { TempCard } from "./components/TempCard";

const FILTERS: { id: CleanFilter; label: string }[] = [
  { id: "unused", label: "Moins utilisés" },
  { id: "largest", label: "Plus volumineux" },
];

export function CleanPage() {
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
      n.has(p) ? n.delete(p) : n.add(p);
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
      <PageHeader title="Nettoyage" subtitle="Libérez de la place dans votre dossier personnel. Rien n'est supprimé définitivement." />
      {error && <Notice>{error}</Notice>}

      <TempCard />

      <Card title="Vos fichiers">
        <div className="toolbar">
          <div className="seg">
            {FILTERS.map((f) => (
              <button key={f.id} className={filter === f.id ? "on" : ""} onClick={() => setFilter(f.id)}>
                {f.label}
              </button>
            ))}
          </div>
          <label className="check">
            <input type="checkbox" checked={onlyFiles} onChange={(e) => setOnlyFiles(e.target.checked)} />
            Fichiers seulement
          </label>
        </div>

        {!canScan && <Empty icon={FolderOpen} text="L'analyse est désactivée dans les Réglages." />}
        {canScan && !rows && <Loading text="Analyse en cours…" />}
        {rows && rows.length === 0 && <Empty icon={FolderOpen} text="Rien à signaler." />}
        {rows && rows.length > 0 && (
          <ul className="list">
            {rows.map((r) => (
              <li key={r.path} className="list-row static">
                <input type="checkbox" checked={picked.has(r.path)} onChange={() => toggle(r.path)} aria-label={`Sélectionner ${r.name}`} />
                {r.isDir ? <Folder size={16} strokeWidth={1.75} /> : <FileText size={16} strokeWidth={1.75} />}
                <span className="grow">
                  <span className="ellipsis">{r.name}</span>
                  <span className="muted small ellipsis">{r.parent}</span>
                </span>
                <span className="muted small nowrap">{ago(r.lastUsed)}</span>
                <span className="nowrap">{bytes(r.size)}</span>
                <Button variant="ghost" icon={FolderOpen} aria-label="Ouvrir le dossier" onClick={() => reveal(r.path)} />
              </li>
            ))}
          </ul>
        )}

        {picked.size > 0 && canDelete && (
          <div className="actionbar">
            <span>{picked.size} sélectionné{picked.size > 1 ? "s" : ""} · {bytes(pickedSize)}</span>
            <ConfirmButton icon={Trash2} label="Mettre à la corbeille" confirmLabel="Oui, mettre à la corbeille" onConfirm={remove} busy={busy} />
          </div>
        )}
        {picked.size > 0 && !canDelete && <p className="muted small">La suppression est désactivée dans les Réglages.</p>}
      </Card>
    </>
  );
}
