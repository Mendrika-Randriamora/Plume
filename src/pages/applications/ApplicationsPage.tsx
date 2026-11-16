import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { RefreshCw, Search } from "lucide-react";
import { Button, Card, Loading, Notice, PageHeader } from "@/core/ui";
import { translate } from "@/core/i18n";
import { usePermission } from "@/core/settings/SettingsProvider";
import { refreshApplications, listApplications, searchApplications, uninstallApplication, getApplicationDetails } from "./api";
import { AppList } from "./components/AppList";
import { AppDetailsModal } from "./components/AppDetailsModal";
import type { Application, ApplicationDetails } from "./types";

const PAGE_SIZE = 100;
const SEARCH_DEBOUNCE_MS = 150;

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function ApplicationsPage() {
  const { t } = useTranslation();
  const allowed = usePermission("systemChanges");
  const [applications, setApplications] = useState<Application[]>([]);
  const [results, setResults] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [isUninstalling, setIsUninstalling] = useState<string | undefined>(undefined);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [details, setDetails] = useState<ApplicationDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  const apply = useCallback((apps: Application[]) => {
    setApplications(apps);
    setResults(apps);
    setVisibleCount(PAGE_SIZE);
  }, []);

  /**
   * `reload` = false s'appuie sur l'inventaire gardé en mémoire par Rust (retour
   * sur la page instantané) ; `true` force un nouveau scan (bouton Actualiser,
   * après une désinstallation).
   */
  const loadApplications = useCallback(
    async (reload = false) => {
      setLoading(true);
      setError(undefined);
      try {
        apply(await (reload ? refreshApplications() : listApplications()));
      } catch (e: unknown) {
        setError(errorMessage(e, translate("applications.errors.load")));
      } finally {
        setLoading(false);
      }
    },
    [apply],
  );

  useEffect(() => {
    void loadApplications();
  }, [loadApplications]);

  // La recherche est débouncée et ne filtre que le cache mémoire côté Rust.
  useEffect(() => {
    const query = searchQuery.trim();
    if (query === "") {
      setResults(applications);
      setVisibleCount(PAGE_SIZE);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const apps = await searchApplications(query);
        if (!cancelled) {
          setResults(apps);
          setVisibleCount(PAGE_SIZE);
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setError(errorMessage(e, translate("applications.errors.search")));
        }
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [searchQuery, applications]);

  const handleUninstall = useCallback(async (desktopId: string) => {
    if (!allowed) {
      setError(translate("common.systemChangesDisabled"));
      return;
    }

    setIsUninstalling(desktopId);
    setError(undefined);
    try {
      const success = await uninstallApplication(desktopId);
      if (success) {
        await loadApplications(true);
      } else {
        setError(translate("applications.errors.uninstall"));
      }
    } catch (e: unknown) {
      setError(errorMessage(e, translate("applications.errors.uninstallGeneric")));
    } finally {
      setIsUninstalling(undefined);
    }
  }, [allowed, loadApplications]);

  const handleDetails = useCallback((desktopId: string) => {
    setSelectedId(desktopId);
  }, []);

  const closeDetails = useCallback(() => {
    setSelectedId(null);
    setDetails(null);
  }, []);

  const loadDetails = useCallback(async () => {
    if (!selectedId) return;
    setDetailsLoading(true);
    setDetails(null);
    try {
      const d = await getApplicationDetails(selectedId);
      setDetails(d);
    } catch (e: unknown) {
      setError(errorMessage(e, translate("applications.errors.details")));
    } finally {
      setDetailsLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    if (selectedId) {
      loadDetails();
    }
  }, [selectedId, loadDetails]);

  const visibleApplications = results.slice(0, visibleCount);
  const remaining = results.length - visibleApplications.length;

  return (
    <>
      <PageHeader
        title={t("applications.title")}
        subtitle={t("applications.subtitle")}
        action={
          <Button icon={RefreshCw} busy={loading} onClick={() => loadApplications(true)}>
            {t("common.refresh")}
          </Button>
        }
      />

      {!allowed && <Notice>{t("common.systemChangesDisabled")}</Notice>}
      {error && <Notice>{error}</Notice>}

      <Card title={t("applications.search.title")} hint={t("applications.search.hint")}>
        <div className="search-container">
          <Search size={18} className="search-icon" />
          <input
            type="text"
            className="search-input"
            placeholder={t("applications.search.placeholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </Card>

      <Card
        title={t("applications.installed.title")}
        hint={t("applications.found", { count: results.length })}
      >
        {loading ? (
          <Loading text={t("applications.loading")} />
        ) : results.length === 0 ? (
          <div className="empty">
            <p>{t("applications.empty")}</p>
            {searchQuery && <p className="muted small">{t("applications.emptyHint")}</p>}
          </div>
        ) : (
          <>
            <AppList
              applications={visibleApplications}
              onUninstall={handleUninstall}
              onDetails={handleDetails}
              isUninstalling={isUninstalling}
              allowed={allowed}
            />
            {remaining > 0 && (
              <div className="row gap" style={{ justifyContent: "center", marginTop: "0.75rem" }}>
                <Button
                  variant="ghost"
                  onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
                >
                  {t("applications.showMore", { count: remaining })}
                </Button>
              </div>
            )}
          </>
        )}
      </Card>

      <AppDetailsModal
        isOpen={selectedId !== null}
        onClose={closeDetails}
        details={details}
        loading={detailsLoading}
      />
    </>
  );
}
