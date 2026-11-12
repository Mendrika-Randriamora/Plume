import { useCallback, useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Card, Loading, Notice, PageHeader } from "@/core/ui";
import { listApplications, searchApplications, uninstallApplication, getApplicationDetails } from "./api";
import { AppList } from "./components/AppList";
import { AppDetailsModal } from "./components/AppDetailsModal";
import type { Application, ApplicationDetails } from "./types";

export function ApplicationsPage() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState("");
  const [isUninstalling, setIsUninstalling] = useState<string | undefined>(undefined);
  const [selectedApp, setSelectedApp] = useState<{ packageName: string; source: string } | null>(null);
  const [details, setDetails] = useState<ApplicationDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  const loadApplications = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const apps = await listApplications();
      setApplications(apps);
    } catch (e: any) {
      setError(e.message || "Erreur lors du chargement des applications");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadApplications();
  }, [loadApplications]);

  const handleSearch = useCallback(async (query: string) => {
    setSearchQuery(query);
    if (query.trim() === "") {
      loadApplications();
      return;
    }
    setLoading(true);
    try {
      const apps = await searchApplications(query);
      setApplications(apps);
    } catch (e: any) {
      setError(e.message || "Erreur lors de la recherche");
    } finally {
      setLoading(false);
    }
  }, [loadApplications]);

  const handleUninstall = useCallback(async (packageName: string, source: string) => {
    const key = `${source}-${packageName}`;
    setIsUninstalling(key);
    setError(undefined);
    try {
      const success = await uninstallApplication(packageName, source);
      if (success) {
        loadApplications();
      } else {
        setError("La désinstallation a échoué. Vérifiez que vous avez les droits d'administration.");
      }
    } catch (e: any) {
      setError(e.message || "Erreur lors de la désinstallation");
    } finally {
      setIsUninstalling(undefined);
    }
  }, [loadApplications]);

  const handleDetails = useCallback((packageName: string, source: string) => {
    setSelectedApp({ packageName, source });
  }, []);

  const closeDetails = useCallback(() => {
    setSelectedApp(null);
    setDetails(null);
  }, []);

  const loadDetails = useCallback(async () => {
    if (!selectedApp) return;
    setDetailsLoading(true);
    setDetails(null);
    try {
      const d = await getApplicationDetails(selectedApp.packageName, selectedApp.source);
      setDetails(d);
    } catch (e: any) {
      setError(e.message || "Erreur lors du chargement des détails");
    } finally {
      setDetailsLoading(false);
    }
  }, [selectedApp]);

  useEffect(() => {
    if (selectedApp) {
      loadDetails();
    }
  }, [selectedApp, loadDetails]);

  return (
    <>
      <PageHeader
        title="Applications"
        subtitle="Gérez toutes les applications installées sur votre système."
      />
      
      {error && <Notice>{error}</Notice>}

      <Card title="Rechercher une application" hint="Recherchez parmi les applications apt, snap et flatpak">
        <div className="search-container">
          <Search size={18} className="search-icon" />
          <input
            type="text"
            className="search-input"
            placeholder="Rechercher une application..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
          />
        </div>
      </Card>

      <Card title="Applications installées" hint={`Trouvées : ${applications.length} applications`}>
        {loading ? (
          <Loading text="Chargement des applications..." />
        ) : applications.length === 0 ? (
          <div className="empty">
            <p>Aucune application trouvée.</p>
            {searchQuery && <p className="muted small">Essayez une autre recherche.</p>}
          </div>
        ) : (
          <AppList
            applications={applications}
            onUninstall={handleUninstall}
            onDetails={handleDetails}
            isUninstalling={isUninstalling}
          />
        )}
      </Card>

      <AppDetailsModal
        isOpen={selectedApp !== null}
        onClose={closeDetails}
        details={details}
        loading={detailsLoading}
      />
    </>
  );
}
