import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp, Cpu, Search, X } from "@/core/ui";
import { bytes, percentValue } from "@/core/format";
import { Card, Empty, Loading, Notice, PageHeader } from "@/core/ui";
import { usePermission, useSettings } from "@/core/settings/SettingsProvider";
import { listProcesses, processDetails, restartProcess, stopProcess } from "./api";
import type { ProcessDetails, ProcessInfo, SortKey } from "./types";
import { ProcessContextMenu } from "./components/ProcessContextMenu";
import { ProcessDetailsModal } from "./components/ProcessDetailsModal";

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

interface MenuState {
  x: number;
  y: number;
  process: ProcessInfo;
}

export function ProcessesPage() {
  const { t, i18n } = useTranslation();
  const { settings } = useSettings();
  const allowed = usePermission("systemChanges");
  const interval = settings.refreshInterval;
  const [rows, setRows] = useState<ProcessInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [limit, setLimit] = useState(50);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "memory", desc: true });
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [detailsProcess, setDetailsProcess] = useState<ProcessInfo | null>(null);
  const [details, setDetails] = useState<ProcessDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);

  const cpu = (value: number) => (value >= 0.05 ? percentValue(value, 1) : "—");
  const rate = (value: number) => (value ? t("common.perSecond", { value: bytes(value) }) : "—");

  const load = useCallback(
    () =>
      listProcesses()
        .then((list) => {
          setRows(list);
          setError(null);
        })
        .catch((e) => {
          setError((e as Error).message);
        }),
    [],
  );

  useEffect(() => {
    let alive = true;
    const tick = () => {
      if (alive) void load();
    };
    tick();
    const id = setInterval(tick, interval);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [interval, load]);

  const message = (code: string) => {
    switch (code) {
      case "process_not_found":
        return t("processes.errors.notFound");
      case "permission_denied":
        return t("processes.errors.permission");
      case "protected_process":
        return t("processes.errors.protected");
      case "restart_unsupported":
        return t("processes.errors.restartUnsupported");
      case "stop_timeout":
        return t("processes.errors.stopTimeout");
      case "restart_failed":
        return t("processes.errors.restartFailed");
      case "unsupported_operation":
        return t("processes.errors.unsupported");
      case "pkexec_missing":
        return t("processes.errors.pkexec");
      default:
        return t("processes.errors.generic");
    }
  };

  const runAction = async (process: ProcessInfo, action: (pid: number) => Promise<void>) => {
    setMenu(null);
    setActionError(null);
    try {
      await action(process.pid);
      await load();
    } catch (e) {
      setActionError(message((e as Error).message));
    }
  };

  const openDetails = async (process: ProcessInfo) => {
    setMenu(null);
    setDetailsProcess(process);
    setDetails(null);
    setDetailsError(null);
    setDetailsLoading(true);
    try {
      setDetails(await processDetails(process.pid));
    } catch {
      setDetailsError(t("processes.details.error"));
    } finally {
      setDetailsLoading(false);
    }
  };

  const closeDetails = () => {
    setDetailsProcess(null);
    setDetails(null);
    setDetailsError(null);
  };

  const search = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!rows) return [];
    if (!search) return rows;
    return rows.filter((p) => p.name.toLowerCase().includes(search) || String(p.pid).includes(search));
  }, [rows, search]);

  const visible = useMemo(() => {
    const dir = sort.desc ? -1 : 1;
    const sorted = [...filtered].sort((a, b) => {
      if (sort.key === "name") return a.name.localeCompare(b.name, i18n.language) * dir;
      return (a[sort.key] - b[sort.key]) * dir;
    });
    return limit ? sorted.slice(0, limit) : sorted;
  }, [filtered, sort, limit, i18n.language]);

  // Nouvelle colonne : décroissant pour les nombres, croissant pour le nom.
  const toggle = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: key !== "name" }));

  const sortColumn = COLUMNS.find((c) => c.key === sort.key) ?? COLUMNS[0];

  return (
    <>
      <PageHeader title={t("processes.title")} subtitle={t("processes.subtitle", { seconds: interval / 1000 })} />
      {!allowed && <Notice>{t("common.systemChangesDisabled")}</Notice>}
      {error && <Notice>{error}</Notice>}
      {actionError && <Notice>{actionError}</Notice>}

      <div className="toolbar">
        <p className="muted small">
          {rows
            ? search
              ? t("processes.summaryFiltered", {
                  count: filtered.length,
                  total: rows.length,
                  query: query.trim(),
                })
              : t("processes.summary", {
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

      <div className="proc-search">
        <Search size={15} strokeWidth={1.75} />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("processes.search.placeholder")}
          aria-label={t("processes.search.placeholder")}
        />
        {query && (
          <button
            type="button"
            className="proc-search-clear"
            onClick={() => setQuery("")}
            title={t("processes.search.clear")}
            aria-label={t("processes.search.clear")}
          >
            <X size={14} />
          </button>
        )}
      </div>

      <Card>
        <div className="proc-divider" />

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

            {filtered.length === 0 ? (
              <Empty
                icon={Search}
                text={search ? t("processes.emptySearch", { query: query.trim() }) : t("processes.empty")}
              />
            ) : (
              visible.map((p) => (
                <div
                  key={p.pid}
                  className="proc-row"
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setMenu({ x: event.clientX, y: event.clientY, process: p });
                  }}
                  title={t("processes.contextHint")}
                >
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
              ))
            )}
          </div>
        )}
      </Card>

      {menu && (
        <ProcessContextMenu
          x={menu.x}
          y={menu.y}
          allowed={allowed}
          onStop={() => void runAction(menu.process, stopProcess)}
          onRestart={() => void runAction(menu.process, restartProcess)}
          onDetails={() => void openDetails(menu.process)}
          onClose={() => setMenu(null)}
        />
      )}

      <ProcessDetailsModal
        isOpen={detailsProcess !== null}
        onClose={closeDetails}
        details={details}
        loading={detailsLoading}
        error={detailsError}
      />
    </>
  );
}
