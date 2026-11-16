import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Cpu } from "lucide-react";
import { bytes } from "@/core/format";
import { Card, Loading, Notice, PageHeader } from "@/core/ui";
import { listProcesses } from "./api";
import type { ProcessInfo, SortKey } from "./types";

/** 0 = tout afficher. */
const LIMITS = [25, 50, 100, 250, 500, 0];

const COLUMNS: { key: SortKey; label: string; numeric?: boolean; disk?: boolean }[] = [
  { key: "name", label: "Nom" },
  { key: "cpu", label: "CPU", numeric: true },
  { key: "pid", label: "ID", numeric: true },
  { key: "memory", label: "Mémoire", numeric: true },
  { key: "read", label: "Lecture disque", numeric: true, disk: true },
  { key: "write", label: "Écriture disque", numeric: true, disk: true },
];

const REFRESH_MS = 2000;

const cpu = (value: number) => (value >= 0.05 ? `${value.toFixed(1)} %` : "—");
const rate = (value: number) => (value ? `${bytes(value)}/s` : "—");

export function ProcessesPage() {
  const [rows, setRows] = useState<ProcessInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(50);
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "memory", desc: true });

  useEffect(() => {
    let alive = true;
    const tick = () =>
      listProcesses()
        .then((list) => {
          if (!alive) return;
          setRows(list);
          setError(null);
        })
        .catch((e) => {
          if (alive) setError((e as Error).message);
        });
    tick();
    const id = setInterval(tick, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const visible = useMemo(() => {
    if (!rows) return [];
    const dir = sort.desc ? -1 : 1;
    const sorted = [...rows].sort((a, b) => {
      if (sort.key === "name") return a.name.localeCompare(b.name) * dir;
      return (a[sort.key] - b[sort.key]) * dir;
    });
    return limit ? sorted.slice(0, limit) : sorted;
  }, [rows, sort, limit]);

  // Nouvelle colonne : décroissant pour les nombres, croissant pour le nom.
  const toggle = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: key !== "name" }));

  const sortLabel = COLUMNS.find((c) => c.key === sort.key)?.label ?? "";

  return (
    <>
      <PageHeader title="Processus" subtitle="Les programmes en cours d'exécution, actualisés toutes les 2 secondes." />
      {error && <Notice>{error}</Notice>}

      <div className="toolbar">
        <p className="muted small">
          {rows ? `${rows.length} processus` : "Lecture…"} · triés par {sortLabel.toLowerCase()}{" "}
          {sort.desc ? "décroissant" : "croissant"}
        </p>
        <label className="row gap small">
          Afficher
          <select value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
            {LIMITS.map((n) => (
              <option key={n} value={n}>{n === 0 ? "Tous" : `${n} processus`}</option>
            ))}
          </select>
        </label>
      </div>

      <Card>
        {!rows ? (
          <Loading text="Lecture des processus…" />
        ) : (
          <div className="proc-table">
            <div className="proc-row head">
              {COLUMNS.map((col) => {
                const active = sort.key === col.key;
                return (
                  <button
                    key={col.key}
                    className={`proc-sort ${col.numeric ? "num" : ""} ${col.disk ? "proc-disk" : ""} ${active ? "on" : ""}`}
                    onClick={() => toggle(col.key)}
                    title={`Trier par ${col.label.toLowerCase()}`}
                  >
                    {col.label}
                    {active && (sort.desc ? <ChevronDown size={12} /> : <ChevronUp size={12} />)}
                  </button>
                );
              })}
            </div>

            {visible.map((p) => (
              <div key={p.pid} className="proc-row">
                <div className="proc-name">
                  <Cpu size={15} strokeWidth={1.75} />
                  <span className="ellipsis" title={`${p.name} (${p.pid})`}>{p.name}</span>
                </div>
                <div className="proc-cell num">{cpu(p.cpu)}</div>
                <div className="proc-cell num muted">{p.pid}</div>
                <div className="proc-cell num">{bytes(p.memory)}</div>
                <div className="proc-cell num proc-disk">{rate(p.read)}</div>
                <div className="proc-cell num proc-disk">{rate(p.write)}</div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
