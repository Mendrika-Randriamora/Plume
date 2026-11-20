import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp, Cpu } from "lucide-react";
import { bytes, percentValue } from "@/core/format";
import { Card, Loading, Notice, PageHeader } from "@/core/ui";
import { useSettings } from "@/core/settings/SettingsProvider";
import { listProcesses } from "./api";
import type { ProcessInfo, SortKey } from "./types";

/** 0 = tout afficher. */
const LIMITS = [25, 50, 100, 250, 500, 0];

const COLUMNS = [
  { key: "name", labelKey: "processes.columns.name", sortKey: "processes.sortColumns.name", numeric: false, disk: false },
  { key: "cpu", labelKey: "processes.columns.cpu", sortKey: "processes.sortColumns.cpu", numeric: true, disk: false },
  { key: "pid", labelKey: "processes.columns.pid", sortKey: "processes.sortColumns.pid", numeric: true, disk: false },
  { key: "memory", labelKey: "processes.columns.memory", sortKey: "processes.sortColumns.memory", numeric: true, disk: false },
  { key: "read", labelKey: "processes.columns.read", sortKey: "processes.sortColumns.read", numeric: true, disk: true },
  { key: "write", labelKey: "processes.columns.write", sortKey: "processes.sortColumns.write", numeric: true, disk: true },
] as const;

export function ProcessesPage() {
  const { t, i18n } = useTranslation();
  const { settings } = useSettings();
  const interval = settings.refreshInterval;
  const [rows, setRows] = useState<ProcessInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(50);
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "memory", desc: true });

  const cpu = (value: number) => (value >= 0.05 ? percentValue(value, 1) : "—");
  const rate = (value: number) => (value ? t("common.perSecond", { value: bytes(value) }) : "—");

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
    const id = setInterval(tick, interval);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [interval]);

  const visible = useMemo(() => {
    if (!rows) return [];
    const dir = sort.desc ? -1 : 1;
    const sorted = [...rows].sort((a, b) => {
      if (sort.key === "name") return a.name.localeCompare(b.name, i18n.language) * dir;
      return (a[sort.key] - b[sort.key]) * dir;
    });
    return limit ? sorted.slice(0, limit) : sorted;
  }, [rows, sort, limit, i18n.language]);

  // Nouvelle colonne : décroissant pour les nombres, croissant pour le nom.
  const toggle = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: key !== "name" }));

  const sortColumn = COLUMNS.find((c) => c.key === sort.key) ?? COLUMNS[0];

  return (
    <>
      <PageHeader title={t("processes.title")} subtitle={t("processes.subtitle", { seconds: interval / 1000 })} />
      {error && <Notice>{error}</Notice>}

      <div className="toolbar">
        <p className="muted small">
          {rows
            ? t("processes.summary", {
                count: rows.length,
                column: t(sortColumn.sortKey),
                direction: t(sort.desc ? "processes.descending" : "processes.ascending"),
              })
            : t("processes.loading")}
        </p>
        <label className="row gap small">
          {t("processes.show")}
          <select value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
            {LIMITS.map((n) => (
              <option key={n} value={n}>
                {n === 0 ? t("processes.all") : t("processes.limit", { count: n })}
              </option>
            ))}
          </select>
        </label>
      </div>

      <Card>
        {!rows ? (
          <Loading text={t("processes.loadingTable")} />
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
                    title={t("processes.sortBy", { column: t(col.sortKey) })}
                  >
                    {t(col.labelKey)}
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
