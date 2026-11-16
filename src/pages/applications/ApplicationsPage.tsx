import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { Button, Card, Loading, Notice, PageHeader } from "@/core/ui";
import { usePermission } from "@/core/settings/SettingsProvider";
import { refreshApplications, searchApplications, uninstallApplication, getApplicationDetails } from "./api";
import { AppList } from "./components/AppList";
import { AppDetailsModal } from "./components/AppDetailsModal";
import type { Application, ApplicationDetails } from "./types";

const PAGE_SIZE = 100;
const SEARCH_DEBOUNCE_MS = 150;

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function ApplicationsPage() {
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

  const loadApplications = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const apps = await refreshApplications();
      setApplications(apps);
      setResults(apps);
      setVisibleCount(PAGE_SIZE);
    } catch (e: unknown) {
      setError(errorMessage(e, "Erreur lors du chargement des applications"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadApplications();
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
          setError(errorMessage(e, "Erreur lors de la recherche"));
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
      setError("Les modifications du système sont désactivées dans les Réglages.");
      return;
    }

    setIsUninstalling(desktopId);
    setError(undefined);
    try {
      const success = await uninstallApplication(desktopId);
      if (success) {
        await loadApplications();
      } else {
        setError("La désinstallation a échoué. Vérifiez que vous avez les droits d'administration.");
      }
    } catch (e: unknown) {
      setError(errorMessage(e, "Erreur lors de la désinstallation"));
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
      setError(errorMessage(e, "Erreur lors du chargement des détails"));
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
        title="Applications"
        subtitle="Gérez les applications visibles dans le menu de votre bureau."
        action={
          <Button icon={RefreshCw} busy={loading} onClick={loadApplications}>
            Rafraîchir
          </Button>
        }
      />

      {!allowed && <Notice>Les modifications du système sont désactivées dans les Réglages.</Notice>}
      {error && <Notice>{error}</Notice>}

      <Card title="Rechercher une application" hint="Recherchez parmi les applications du menu">
        <div className="search-container">
          <Search size={18} className="search-icon" />
          <input
            type="text"
            className="search-input"
            placeholder="Rechercher une application..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </Card>

      <Card
        title="Applications installées"
        hint={`Trouvées : ${results.length} application${results.length > 1 ? "s" : ""}`}
      >
        {loading ? (
          <Loading text="Chargement des applications..." />
        ) : results.length === 0 ? (
          <div className="empty">
            <p>Aucune application trouvée.</p>
            {searchQuery && <p className="muted small">Essayez une autre recherche.</p>}
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
                  Afficher plus ({remaining})
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
