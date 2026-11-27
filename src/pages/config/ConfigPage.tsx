import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  Card,
  CheckCircle2,
  CircleAlert,
  Diff,
  Empty,
  FileCode,
  FileText,
  FolderOpen,
  FolderTree,
  Loading,
  Notice,
  Plus,
  RotateCcw,
  Save,
  Search,
  TriangleAlert,
  X,
} from "@/core/ui";
import { configSupported, indexStatus, listKnownConfigs, openConfigFile, readConfig, searchConfigs, startIndex, writeConfig } from "./api";
import { ConfigEditor } from "./components/ConfigEditor";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { DiffModal } from "./components/DiffModal";
import { BackupsModal } from "./components/BackupsModal";
import { formatConfigError } from "./errors";
import type { ConfigEntry, ConfigFile, IndexStatus, SearchResult } from "./types";

const EMPTY_INDEX: IndexStatus = { ready: false, building: false, count: 0 };
const EMPTY_SEARCH: SearchResult = { ready: false, building: false, items: [] };

function fileName(path: string): string {
  return path.split("/").filter(Boolean).pop() ?? path;
}

interface DropdownItem {
  path: string;
  label: string;
}

const MAX_DROPDOWN_ITEMS = 8;
const MAX_CATALOG_DROPDOWN_ITEMS = 20;

export function ConfigPage() {
  const { t } = useTranslation();
  const searchRef = useRef<HTMLInputElement>(null);

  const [supported, setSupported] = useState<boolean | null>(null);
  const [known, setKnown] = useState<ConfigEntry[] | null>(null);
  const [selected, setSelected] = useState<ConfigFile | null>(null);
  const [content, setContent] = useState("");
  const [original, setOriginal] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState<SearchResult>(EMPTY_SEARCH);
  const [index, setIndex] = useState<IndexStatus>(EMPTY_INDEX);
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [diffOpen, setDiffOpen] = useState(false);
  const [backupsOpen, setBackupsOpen] = useState(false);
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const [saveConfirmOpen, setSaveConfirmOpen] = useState(false);
  const [browseOpen, setBrowseOpen] = useState(false);

  // Détection de la plateforme puis chargement du catalogue connu.
  useEffect(() => {
    let cancelled = false;

    configSupported()
      .then((ok) => {
        if (cancelled) return;
        setSupported(ok);
        if (!ok) return;

        void listKnownConfigs()
          .then((knownList) => {
            if (!cancelled) setKnown(knownList);
          })
          .catch((reason: unknown) => {
            if (!cancelled) setError(formatConfigError(reason));
          });

        void startIndex();
        void indexStatus()
          .then((status) => {
            if (!cancelled) setIndex(status);
          })
          .catch(() => {
            /* l'index est optionnel : la liste connue reste utilisable */
          });
      })
      .catch(() => {
        if (!cancelled) setSupported(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // L'index est construit en arrière-plan : on interroge son état sans bloquer.
  useEffect(() => {
    if (!supported || index.ready) return;
    const id = window.setInterval(() => {
      indexStatus()
        .then(setIndex)
        .catch(() => {
          /* on retentera au prochain passage */
        });
    }, 1200);
    return () => window.clearInterval(id);
  }, [supported, index.ready]);

  // Recherche floue debouncée : uniquement dans l'index mémoire de Rust.
  useEffect(() => {
    const value = query.trim();
    if (value === "") {
      setSearch({ ready: index.ready, building: index.building, items: [] });
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      searchConfigs(value)
        .then((result) => {
          if (!cancelled) setSearch(result);
        })
        .catch((reason: unknown) => {
          if (!cancelled) setError(formatConfigError(reason));
        });
    }, 150);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, supported, index.ready, index.building]);

  const loadFile = useCallback(async (path: string): Promise<boolean> => {
    setLoading(true);
    setError(null);
    setNotice(null);
    setSelected(null);
    setContent("");
    setOriginal("");
    try {
      const file = await readConfig(path);
      setSelected(file);
      setContent(file.content);
      setOriginal(file.content);
      return true;
    } catch (reason: unknown) {
      setError(formatConfigError(reason));
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const dirty = content !== original;
  const validationLabel = selected?.validate?.length
    ? t("config.status.validationActive", { command: selected.validate[0] })
    : null;

  const requestOpen = useCallback(
    (path: string) => {
      if (selected && dirty) {
        if (path === selected.path) return;
        setPendingPath(path);
        return;
      }
      void loadFile(path);
    },
    [selected, dirty, loadFile],
  );

  const save = useCallback(async () => {
    if (!selected || selected.readOnly) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await writeConfig(selected.path, content, selected.root);
      setOriginal(content);
      setNotice(t("config.status.saved"));
    } catch (reason: unknown) {
      setError(formatConfigError(reason));
    } finally {
      setSaving(false);
      setSaveConfirmOpen(false);
    }
  }, [selected, content, t]);

  const requestSave = useCallback(() => {
    if (!selected || selected.readOnly || saving || !dirty) return;
    if (selected.danger === "high") {
      setSaveConfirmOpen(true);
      return;
    }
    void save();
  }, [selected, saving, dirty, save]);

  const reloadAfterRestore = useCallback(async () => {
    if (!selected) return;
    const ok = await loadFile(selected.path);
    if (ok) setNotice(t("config.backups.restored"));
  }, [selected, loadFile, t]);

  // Résultats de la barre de recherche : catalogue connu en priorité, puis index.
  const dropdownItems = useMemo<DropdownItem[]>(() => {
    const value = query.trim().toLowerCase();
    const items: DropdownItem[] = [];

    if (value === "") {
      const list = known ?? [];
      for (const entry of list) {
        items.push({ path: entry.path, label: entry.label });
        if (items.length >= MAX_CATALOG_DROPDOWN_ITEMS) break;
      }
      return items;
    }

    const knownHits = (known ?? []).filter((entry) =>
      [entry.label, entry.path, entry.description].some((text) => text.toLowerCase().includes(value)),
    );
    for (const entry of knownHits) {
      items.push({ path: entry.path, label: entry.label });
    }
    for (const path of search.items) {
      if (items.length >= MAX_DROPDOWN_ITEMS) break;
      if (items.some((item) => item.path === path)) continue;
      items.push({ path, label: fileName(path) });
    }
    return items.slice(0, MAX_DROPDOWN_ITEMS);
  }, [query, known, search.items]);

  const openDropdownItem = useCallback(
    (path: string) => {
      setFocused(false);
      setActiveIndex(-1);
      setQuery("");
      requestOpen(path);
    },
    [requestOpen],
  );

  const browseTo = useCallback(
    async (path: string) => {
      setBrowseOpen(false);
      try {
        const chosen = await openConfigFile({ defaultPath: path });
        if (chosen) requestOpen(chosen);
      } catch (reason: unknown) {
        setError(formatConfigError(reason));
      }
    },
    [requestOpen],
  );

  const focusSearch = useCallback(() => {
    searchRef.current?.focus();
    setFocused(true);
  }, []);

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "k" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      searchRef.current?.focus();
      setFocused(true);
      return;
    }
    if (event.key === "Escape") {
      setFocused(false);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setFocused(true);
      if (dropdownItems.length === 0) return;
      setActiveIndex((previous) => {
        if (event.key === "ArrowDown") {
          return Math.min(previous + 1, dropdownItems.length - 1);
        }
        if (event.key === "ArrowUp") {
          return previous <= 0 ? -1 : previous - 1;
        }
        return previous;
      });
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const value = query.trim();
      if (dropdownItems.length > 0 && activeIndex >= 0) {
        const item = dropdownItems[Math.min(activeIndex, dropdownItems.length - 1)];
        if (item) openDropdownItem(item.path);
        return;
      }
      if (value === "") return;
      if (value.startsWith("/") || value.startsWith("~")) requestOpen(value);
    }
  };

  return (
    <div className="config-page">
      <div className="config-topbar">
        <h1 className="config-page-title">{t("config.title")}</h1>
        <div className="config-topbar-row">
          <div className="config-search-wrap">
            <div className="search-container config-search">
              <Search size={16} className="search-icon" />
              <input
                ref={searchRef}
                type="text"
                className="search-input"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node)) setFocused(false);
                }}
                onKeyDown={handleSearchKeyDown}
                placeholder={t("config.search.placeholder")}
                aria-label={t("config.search.placeholder")}
              />
              {query !== "" && (
                <button
                  type="button"
                  className="proc-search-clear"
                  onClick={() => setQuery("")}
                  aria-label={t("config.search.clear")}
                >
                  <X size={14} />
                </button>
              )}
            </div>
            {focused && (
              <div className="config-search-results">
                {dropdownItems.length === 0 ? (
                  <p className="muted small config-side-note">{t("config.search.indexing")}</p>
                ) : (
                  dropdownItems.map((item, position) => (
                    <button
                      key={item.path}
                      type="button"
                      className={`config-item ${position === activeIndex ? "active" : ""}`}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        openDropdownItem(item.path);
                      }}
                      onMouseEnter={() => setActiveIndex(position)}
                    >
                      <FileText size={15} strokeWidth={1.75} />
                      <span className="grow">
                        <span className="ellipsis">{item.label}</span>
                        <span className="muted small ellipsis">{item.path}</span>
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          <div className="config-browse">
            <Button
              variant="ghost"
              icon={FolderOpen}
              onClick={() => void browseTo("/etc")}
              title={t("config.actions.browse")}
              aria-label={t("config.actions.browse")}
            >
              {t("config.actions.browse")}
            </Button>
            {browseOpen && (
              <div className="config-search-results">
                <button type="button" className="config-item" onClick={() => void browseTo("/etc")}>
                  <FolderTree size={15} strokeWidth={1.75} />
                  <span className="grow">
                    <span className="ellipsis">{t("config.browser.system")}</span>
                  </span>
                </button>
                <button type="button" className="config-item" onClick={() => void browseTo("~/.config")}>
                  <FolderTree size={15} strokeWidth={1.75} />
                  <span className="grow">
                    <span className="ellipsis">{t("config.browser.user")}</span>
                  </span>
                </button>
              </div>
            )}
          </div>
          <Button
            variant="ghost"
            icon={Plus}
            onClick={focusSearch}
            title={t("config.favorites.add")}
            aria-label={t("config.favorites.add")}
          />
        </div>
      </div>

      {error && <Notice>{error}</Notice>}
      {notice && <Notice>{notice}</Notice>}

      {supported === null && <Loading />}

      {supported === false && (
        <Card>
          <Empty icon={FileCode} text={t("config.unsupported")} />
        </Card>
      )}

      {supported && (
        <>
          {selected && !loading && (
            <div className="config-open-line">
              <strong>{selected.label}</strong>
              <span className="muted small config-open-path">{selected.path}</span>
            </div>
          )}

          {selected && !loading && selected.danger === "high" && (
            <div className="config-warning">
              <TriangleAlert size={18} strokeWidth={1.75} />
              <div>
                <strong>{t("config.danger.high")}</strong>
                <p className="small">{t("config.danger.highHint")}</p>
              </div>
            </div>
          )}

          <section className="config-editor-area">
            {loading ? (
              <div className="config-empty-editor">
                <Loading text={t("config.editor.loading")} />
              </div>
            ) : selected ? (
              <ConfigEditor
                key={selected.path}
                value={content}
                language={selected.language}
                readOnly={selected.readOnly}
                onChange={setContent}
                onSave={requestSave}
              />
            ) : (
              <div className="config-empty-editor">
                <p className="muted">{t("config.empty.hint")}</p>
              </div>
            )}
          </section>

          {selected && !loading && (
            <footer className="config-actions-bar">
              <div className="config-status">
                {dirty ? (
                  <>
                    <CircleAlert size={15} strokeWidth={1.75} />
                    <span>{t("config.status.dirty")}</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={15} strokeWidth={1.75} />
                    <span>{t("config.status.saved")}</span>
                  </>
                )}
                {validationLabel && <span className="muted small config-validation">{validationLabel}</span>}
              </div>
              <div className="row gap config-action-buttons">
                <Button variant="ghost" icon={Diff} disabled={!dirty} onClick={() => setDiffOpen(true)}>
                  {t("config.actions.diff")}
                </Button>
                <Button variant="ghost" icon={RotateCcw} onClick={() => setBackupsOpen(true)}>
                  {t("config.actions.restore")}
                </Button>
                <Button icon={Save} disabled={!dirty || selected.readOnly} busy={saving} onClick={requestSave}>
                  {t("config.actions.save")}
                </Button>
              </div>
            </footer>
          )}
        </>
      )}

      {diffOpen && selected && <DiffModal before={original} after={content} onClose={() => setDiffOpen(false)} />}

      {backupsOpen && selected && (
        <BackupsModal path={selected.path} onClose={() => setBackupsOpen(false)} onRestored={reloadAfterRestore} />
      )}

      {pendingPath && selected && (
        <ConfirmDialog
          title={t("config.confirm.unsavedTitle")}
          text={t("config.confirm.unsavedText", { name: selected.label })}
          confirmLabel={t("config.actions.changeFile")}
          onConfirm={() => {
            const next = pendingPath;
            setPendingPath(null);
            if (next) void loadFile(next);
          }}
          onCancel={() => setPendingPath(null)}
        />
      )}

      {saveConfirmOpen && selected && (
        <ConfirmDialog
          title={t("config.confirm.dangerTitle")}
          text={t("config.confirm.dangerText", { name: selected.label })}
          confirmLabel={t("config.actions.confirmSave")}
          danger
          busy={saving}
          onConfirm={() => void save()}
          onCancel={() => setSaveConfirmOpen(false)}
        />
      )}
    </div>
  );
}
