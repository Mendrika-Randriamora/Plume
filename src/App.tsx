import { Suspense, useEffect, useMemo, useState } from "react";
import { pages } from "@/pages/registry";
import { Sidebar } from "@/core/layout/Sidebar";
import { NavContext } from "@/core/layout/nav";
import { UpdateBanner } from "@/core/updater/UpdateBanner";
import { useSettings } from "@/core/settings/SettingsProvider";
import { Loading } from "@/core/ui";
import { usePolling } from "@/core/live";
import { sampleHomeStats, loadHighlights, loadObsolete } from "@/pages/home/live";
import { sampleResources } from "@/pages/resources/live";

export default function App() {
  const { settings } = useSettings();
  const [current, setCurrent] = useState(pages[0].id);
  const page = useMemo(() => pages.find((p) => p.id === current) ?? pages[0], [current]);
  const Page = page.component;

  // Relevés continus, même quand la page n'est pas affichée : Accueil et
  // Ressources s'ouvrent avec des données déjà prêtes, sans temps d'attente.
  usePolling(sampleResources, 1000);
  usePolling(sampleHomeStats, 5000);

  // Le parcours du dossier personnel est coûteux : un seul scan, lancé en
  // arrière-plan au démarrage, puis conservé en mémoire. La liste des paquets
  // obsolètes est préchargée de la même façon.
  const canScan = settings.permissions.scanHome;
  useEffect(() => {
    const id = window.setTimeout(() => {
      if (canScan) void loadHighlights();
      void loadObsolete();
    }, 2500);
    return () => window.clearTimeout(id);
  }, [canScan]);

  return (
    <NavContext.Provider value={{ go: setCurrent }}>
      <div className={`shell ${settings.interfaceV2 ? "shell-card" : ""}`}>
        <Sidebar current={current} onSelect={setCurrent} />
        <main className="content">
          <UpdateBanner />
          <Suspense fallback={<Loading />}>
            <Page />
          </Suspense>
        </main>
      </div>
    </NavContext.Provider>
  );
}
