import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  Card,
  Empty,
  Loading,
  Notice,
  PageHeader,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  X,
} from "@/core/ui";
import { usePolling } from "@/core/live";
import { usePermission, useSettings } from "@/core/settings/SettingsProvider";
import { listPorts, stopPortProcess } from "./api";
import { DEFAULT_WATCHED_PORTS, loadConfig, MAX_PINNED, saveConfig } from "./storage";
import { serviceKey } from "./services";
import { Plug } from "./icons";
import { PortRow } from "./components/PortRow";
import { OtherPorts } from "./components/OtherPorts";
import { StopDialog } from "./components/StopDialog";
import { WatchedPortsDialog } from "./components/WatchedPortsDialog";
import { Credit } from "./components/Credit";
import type {
  PortEntry,
  PortStatus,
  PorterConfig,
  StopTarget,
  WatchedPort,
  WatchedRow,
} from "./types";
import "./porter.css";

const FILTER_ORDER: readonly PortStatus[] = ["free", "busy", "system"];

const STATUS_KEYS = {
  free: "porter.status.free",
  busy: "porter.status.busy",
  system: "porter.status.system",
} as const;

const STATS_KEYS = {
  free: "porter.stats.free",
  busy: "porter.stats.busy",
  system: "porter.stats.system",
} as const;

interface NoticeState {
  kind: "success" | "error" | "info";
  text: string;
  elevate?: StopTarget;
}

export function PorterPage() {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const allowed = usePermission("systemChanges");

  const [config, setConfig] = useState<PorterConfig>(loadConfig);
  const [entries, setEntries] = useState<PortEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [stopTarget, setStopTarget] = useState<StopTarget | null>(null);
  const [stopBusy, setStopBusy] = useState(false);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [undoPin, setUndoPin] = useState<{ port: number; index: number } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [otherOpen, setOtherOpen] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);
  const request = useRef(0);
  const interval = Math.max(settings.refreshInterval, 5000);

  useEffect(() => {
    saveConfig(config);
  }, [config]);

  const load = useCallback(
    async (includeOutgoing?: boolean) => {
      const id = ++request.current;
      try {
        const list = await listPorts(includeOutgoing ?? config.includeOutgoing);
        if (id !== request.current) return;
        setEntries(list);
        setError(null);
      } catch (caught) {
        if (id !== request.current) return;
        setError((caught as Error).message);
      }
    },
    [config.includeOutgoing],
  );

  usePolling(() => {
    void load();
  }, interval);

  useEffect(() => {
    if (!notice || notice.kind === "error") return;
    const id = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(id);
  }, [notice]);

  useEffect(() => {
    if (!undoPin) return;
    const id = window.setTimeout(() => setUndoPin(null), 6000);
    return () => window.clearTimeout(id);
  }, [undoPin]);

  useEffect(() => {
    const editable = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      return (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      );
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (settingsOpen || stopTarget) return;
      if (event.key === "Escape" && query) {
        setQuery("");
        searchRef.current?.blur();
        return;
      }
      if (event.key !== "/" || editable(event.target)) return;
      event.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [settingsOpen, stopTarget, query]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const changeIncludeOutgoing = (value: boolean) => {
    setConfig((current) => ({ ...current, includeOutgoing: value }));
    void load(value);
  };

  const search = query.trim().toLowerCase();

  const matches = useCallback(
    (port: number, status: PortStatus, process: string | null) => {
      if (!config.filters[status]) return false;
      if (!search) return true;
      return String(port).includes(search) || (process ?? "").toLowerCase().includes(search);
    },
    [config.filters, search],
  );

  const watchedRows = useMemo<WatchedRow[]>(() => {
    const byPort = new Map<number, PortEntry[]>();
    for (const entry of entries ?? []) {
      if (!entry.listening) continue;
      const list = byPort.get(entry.port);
      if (list) list.push(entry);
      else byPort.set(entry.port, [entry]);
    }

    return config.watched.map((watched) => {
      const list = byPort.get(watched.port) ?? [];
      const stoppable = list.find((entry) => !entry.system && entry.pid !== null) ?? null;
      const status: PortStatus = list.length === 0 ? "free" : stoppable ? "busy" : "system";
      return {
        watched,
        entries: list,
        status,
        representative: stoppable ?? list[0] ?? null,
        stoppable,
      };
    });
  }, [entries, config.watched]);

  const visibleRows = useMemo(() => {
    const rows = watchedRows.filter((row) =>
      matches(row.watched.port, row.status, row.representative?.process ?? null),
    );
    const pinnedSet = new Set(config.pinned);
    const pinned = config.pinned
      .map((port) => rows.find((row) => row.watched.port === port))
      .filter((row): row is WatchedRow => row !== undefined);
    const rest = rows
      .filter((row) => !pinnedSet.has(row.watched.port))
      .sort((a, b) => a.watched.port - b.watched.port);
    return [...pinned, ...rest];
  }, [watchedRows, matches, config.pinned]);

  const counts = useMemo(() => {
    const result: Record<PortStatus, number> = { free: 0, busy: 0, system: 0 };
    for (const row of watchedRows) result[row.status] += 1;
    return result;
  }, [watchedRows]);

  const watchedPorts = useMemo(
    () => new Set(config.watched.map((item) => item.port)),
    [config.watched],
  );

  const otherRows = useMemo(() => {
    const seen = new Set<string>();
    return (entries ?? [])
      .filter((entry) => {
        if (watchedPorts.has(entry.port)) return false;
        if (!entry.listening && !config.includeOutgoing) return false;
        const status: PortStatus = entry.system ? "system" : "busy";
        if (!matches(entry.port, status, entry.process)) return false;
        const key = `${entry.protocol}-${entry.address}-${entry.remote}-${entry.port}-${entry.pid ?? "none"}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort(
        (a, b) =>
          a.port - b.port ||
          a.protocol.localeCompare(b.protocol) ||
          a.address.localeCompare(b.address),
      );
  }, [entries, watchedPorts, config.includeOutgoing, matches]);

  const labelFor = (watched: WatchedPort) => {
    if (watched.label) return watched.label;
    const key = serviceKey(watched.port);
    return key ? t(key) : t("porter.settings.defaultLabel");
  };

  const toggleFilter = (key: PortStatus) => {
    setConfig((current) => ({
      ...current,
      filters: { ...current.filters, [key]: !current.filters[key] },
    }));
  };

  const togglePin = (port: number) => {
    if (config.pinned.includes(port)) {
      const index = config.pinned.indexOf(port);
      setConfig((current) => ({
        ...current,
        pinned: current.pinned.filter((value) => value !== port),
      }));
      setUndoPin({ port, index });
      return;
    }

    if (config.pinned.length >= MAX_PINNED) {
      setNotice({ kind: "error", text: t("porter.pin.limit", { count: MAX_PINNED }) });
      return;
    }

    setConfig((current) =>
      current.pinned.includes(port)
        ? current
        : { ...current, pinned: [...current.pinned, port] },
    );
    setUndoPin(null);
  };

  const undoUnpin = () => {
    if (!undoPin) return;
    const { port, index } = undoPin;
    setConfig((current) => {
      if (!current.watched.some((item) => item.port === port)) return current;
      if (current.pinned.includes(port) || current.pinned.length >= MAX_PINNED) return current;
      const pinned = [...current.pinned];
      pinned.splice(Math.min(index, pinned.length), 0, port);
      return { ...current, pinned };
    });
    setUndoPin(null);
  };

  const addWatched = (port: number, label: string | null) => {
    if (config.watched.some((item) => item.port === port)) return false;
    setConfig((current) => ({ ...current, watched: [...current.watched, { port, label }] }));
    setNotice({ kind: "success", text: t("porter.settings.added", { port }) });
    return true;
  };

  const removeWatched = (port: number) => {
    setConfig((current) => ({
      ...current,
      watched: current.watched.filter((item) => item.port !== port),
      pinned: current.pinned.filter((value) => value !== port),
    }));
    if (undoPin?.port === port) setUndoPin(null);
    setNotice({ kind: "info", text: t("porter.settings.removed", { port }) });
  };

  const setWatchedLabel = (port: number, label: string | null) => {
    setConfig((current) => ({
      ...current,
      watched: current.watched.map((item) =>
        item.port === port ? { ...item, label: label && label.trim() ? label : null } : item,
      ),
    }));
  };

  const resetWatched = () => {
    setConfig((current) => ({
      ...current,
      watched: DEFAULT_WATCHED_PORTS.map((port) => ({ port, label: null })),
      pinned: current.pinned.filter((port) => DEFAULT_WATCHED_PORTS.includes(port)),
    }));
    setUndoPin(null);
  };

  const requestStop = (target: StopTarget) => {
    if (!allowed) return;
    setNotice(null);
    setStopTarget(target);
  };

  const runStop = async (target: StopTarget, elevate: boolean) => {
    setStopBusy(true);
    setNotice(null);
    try {
      const outcome = await stopPortProcess(target.pid, elevate);
      setStopTarget(null);

      switch (outcome.status) {
        case "stopped":
          setNotice({
            kind: "success",
            text: t("porter.stop.success", { name: target.name, pid: target.pid }),
          });
          await load();
          break;
        case "permissionDenied":
          setNotice({ kind: "error", text: t("porter.stop.permission"), elevate: target });
          break;
        case "elevationCancelled":
          setNotice({ kind: "error", text: t("porter.stop.cancelled") });
          break;
        case "elevationUnavailable":
          setNotice({ kind: "error", text: t("porter.stop.unavailable") });
          break;
        case "protected":
          setNotice({ kind: "error", text: t("porter.stop.protected") });
          break;
        case "notFound":
          setNotice({ kind: "error", text: t("porter.stop.notFound") });
          await load();
          break;
        case "timeout":
          setNotice({ kind: "error", text: t("porter.stop.timeout") });
          break;
        case "unsupported":
          setNotice({ kind: "error", text: t("porter.stop.unsupported") });
          break;
        case "failed":
          setNotice({ kind: "error", text: t("porter.stop.failed") });
          break;
      }
    } catch (caught) {
      setStopTarget(null);
      setNotice({ kind: "error", text: (caught as Error).message });
    } finally {
      setStopBusy(false);
    }
  };

  const elevateTarget = notice?.elevate ?? null;
  const emptyText =
    config.watched.length === 0
      ? t("porter.empty")
      : search
        ? t("porter.emptyFiltered", { query: query.trim() })
        : t("porter.emptyFilters");

  return (
    <>
      <PageHeader
        title={t("porter.title")}
        subtitle={t("porter.subtitle", { seconds: interval / 1000 })}
        action={
          <Button variant="ghost" icon={RefreshCw} busy={refreshing} onClick={() => void refresh()}>
            {t("common.refresh")}
          </Button>
        }
      />

      {!allowed && <Notice>{t("common.systemChangesDisabled")}</Notice>}
      {error && <Notice>{error}</Notice>}

      {notice && (
        <div className="notice row gap porter-notice" aria-live="polite">
          <span className="grow">{notice.text}</span>
          {elevateTarget && (
            <Button
              variant="ghost"
              icon={ShieldCheck}
              disabled={!allowed || stopBusy}
              busy={stopBusy}
              onClick={() => void runStop(elevateTarget, true)}
            >
              {t("porter.stop.elevate")}
            </Button>
          )}
          <Button
            variant="ghost"
            icon={X}
            onClick={() => setNotice(null)}
            aria-label={t("common.close")}
          />
        </div>
      )}

      {undoPin && (
        <div className="notice row gap porter-notice" aria-live="polite">
          <span className="grow">{t("porter.pin.undo", { port: undoPin.port })}</span>
          <Button variant="ghost" onClick={undoUnpin}>
            {t("porter.pin.undoAction")}
          </Button>
        </div>
      )}

      <div className="porter-stats">
        {FILTER_ORDER.map((key) => (
          <div key={key} className="card porter-stat">
            <span className="muted small porter-stat-label">
              <span className={`porter-dot ${key}`} />
              {t(STATS_KEYS[key])}
            </span>
            <strong>{counts[key]}</strong>
          </div>
        ))}
      </div>

      <Card>
        <div className="toolbar">
          <div className="proc-search porter-search">
            <Search size={15} strokeWidth={1.75} />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setQuery("");
                  event.currentTarget.blur();
                }
              }}
              placeholder={t("porter.search.placeholder")}
              aria-label={t("porter.search.placeholder")}
              aria-keyshortcuts="/"
            />
            {query && (
              <button
                type="button"
                className="proc-search-clear"
                onClick={() => setQuery("")}
                title={t("porter.search.clear")}
                aria-label={t("porter.search.clear")}
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="row gap porter-tools">
            <div className="row gap porter-filters" role="group" aria-label={t("porter.filters.title")}>
              {FILTER_ORDER.map((key) => (
                <button
                  key={key}
                  type="button"
                  className={`chip-button ${config.filters[key] ? "on" : ""}`}
                  aria-pressed={config.filters[key]}
                  onClick={() => toggleFilter(key)}
                >
                  <span className={`porter-dot ${key}`} />
                  {t(STATUS_KEYS[key])}
                </button>
              ))}
            </div>
            <Button
              variant="ghost"
              icon={Settings}
              onClick={() => setSettingsOpen(true)}
              aria-label={t("porter.settings.title")}
              title={t("porter.settings.title")}
            />
          </div>
        </div>

        <div className="proc-divider" />

        {entries === null ? (
          error ? (
            <Empty icon={Plug} text={t("porter.loadError")} />
          ) : (
            <Loading text={t("porter.loading")} />
          )
        ) : (
          <div className="porter-table">
            <div className="porter-row porter-head" role="row">
              <span aria-hidden="true" />
              <span>{t("porter.columns.port")}</span>
              <span>{t("porter.columns.service")}</span>
              <span>{t("porter.columns.status")}</span>
              <span>{t("porter.columns.process")}</span>
              <span>{t("porter.columns.actions")}</span>
            </div>

            {visibleRows.length === 0 ? (
              <Empty icon={Search} text={emptyText} />
            ) : (
              visibleRows.map((row) => (
                <PortRow
                  key={row.watched.port}
                  row={row}
                  label={labelFor(row.watched)}
                  pinned={config.pinned.includes(row.watched.port)}
                  allowed={allowed}
                  onTogglePin={togglePin}
                  onStop={requestStop}
                />
              ))
            )}
          </div>
        )}
      </Card>

      <OtherPorts
        open={otherOpen}
        onToggle={() => setOtherOpen((value) => !value)}
        rows={otherRows}
        includeOutgoing={config.includeOutgoing}
        onIncludeOutgoing={changeIncludeOutgoing}
        allowed={allowed}
        onStop={requestStop}
        search={search}
      />

      <p className="muted small porter-privacy">{t("porter.privacy")}</p>
      <Credit onError={(message) => setNotice({ kind: "error", text: message })} />

      {settingsOpen && (
        <WatchedPortsDialog
          watched={config.watched}
          onAdd={addWatched}
          onRemove={removeWatched}
          onLabel={setWatchedLabel}
          onReset={resetWatched}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {stopTarget && (
        <StopDialog
          target={stopTarget}
          busy={stopBusy}
          onConfirm={() => void runStop(stopTarget, false)}
          onCancel={() => setStopTarget(null)}
        />
      )}
    </>
  );
}
