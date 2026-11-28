import { Suspense, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { pages, visiblePages } from "@/pages/registry";
import { Sidebar } from "@/core/layout/Sidebar";
import { TitleBar } from "@/core/layout/TitleBar";
import { useMaximized } from "@/core/layout/useMaximized";
import { NavContext } from "@/core/layout/nav";
import { UpdateBanner } from "@/core/updater/UpdateBanner";
import { useSettings } from "@/core/settings/SettingsProvider";
import { Loading } from "@/core/ui";
import { usePolling } from "@/core/live";
import { sampleHomeStats, loadHighlights, loadObsolete } from "@/pages/home/live";
import { sampleResources } from "@/pages/resources/live";

export default function App() {
  const { t } = useTranslation();
  const { settings, titleBarMode } = useSettings();
  const visible = useMemo(
    () => visiblePages(settings.pageOrder, settings.hiddenPages),
    [settings.pageOrder, settings.hiddenPages],
  );
  // Au démarrage, on ouvre la première page visible. Une page masquée reste
  // accessible par navigation explicite (par exemple la bannière de mise à jour).
  const [current, setCurrent] = useState(() => visible[0]?.id ?? pages[0].id);
  const page = useMemo(
    () => pages.find((p) => p.id === current) ?? visible[0] ?? pages[0],
    [current, visible],
  );
  const Page = page.component;

  // Relevés continus, même quand la page n'est pas affichée : Accueil et
  // Ressources s'ouvrent avec des données déjà prêtes, sans temps d'attente.
  // L'intervalle est réglable depuis les préférences.
  const refresh = settings.refreshInterval;
  usePolling(() => sampleResources(refresh), refresh);
  usePolling(sampleHomeStats, refresh);

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

  // La barre personnalisée reste affichée jusqu'au redémarrage effectif :
  // sous Wayland, les décorations système ne peuvent être ajoutées qu'à la
  // création de la fenêtre, jamais à chaud.
  const showTitleBar = titleBarMode !== "native";

  return (
    <NavContext.Provider value={{ go: setCurrent }}>
      <div className={`shell ${settings.interfaceV2 ? "shell-card" : ""}`}>
        {showTitleBar && <TitleBar title={t(page.label)} />}
        <div className="shell-body">
          <Sidebar current={current} onSelect={setCurrent} />
          <main className="content">
            <div className="page">
              <UpdateBanner />
              <Suspense fallback={<Loading />}>
                <Page />
              </Suspense>
            </div>
          </main>
        </div>
        {showTitleBar && <ResizeZones />}
      </div>
    </NavContext.Provider>
  );
}

/** Côtés de redimensionnement acceptés par la fenêtre Tauri. */
type ResizeDirection = "North" | "South" | "East" | "West" | "NorthEast" | "NorthWest" | "SouthEast" | "SouthWest";

/** Zones invisibles aux bords de la fenêtre : redimensionnement hors Wayland. */
function ResizeZones() {
  const maximized = useMaximized();
  const appWindow = getCurrentWindow();

  const startResize = async (direction: ResizeDirection) => {
    await appWindow.startResizeDragging(direction);
  };

  if (maximized) return null;

  return (
    <div className="window-resize" aria-hidden="true">
      <div className="resize-zone resize-zone-north" onPointerDown={() => void startResize("North")} />
      <div className="resize-zone resize-zone-south" onPointerDown={() => void startResize("South")} />
      <div className="resize-zone resize-zone-west" onPointerDown={() => void startResize("West")} />
      <div className="resize-zone resize-zone-east" onPointerDown={() => void startResize("East")} />
      <div className="resize-zone resize-zone-northwest" onPointerDown={() => void startResize("NorthWest")} />
      <div className="resize-zone resize-zone-northeast" onPointerDown={() => void startResize("NorthEast")} />
      <div className="resize-zone resize-zone-southwest" onPointerDown={() => void startResize("SouthWest")} />
      <div className="resize-zone resize-zone-southeast" onPointerDown={() => void startResize("SouthEast")} />
    </div>
  );
}
