import { useMemo, useState } from "react";
import { pages } from "@/pages/registry";
import { Sidebar } from "@/core/layout/Sidebar";
import { NavContext } from "@/core/layout/nav";
import { UpdateBanner } from "@/core/updater/UpdateBanner";
import { useSettings } from "@/core/settings/SettingsProvider";

export default function App() {
  const { settings } = useSettings();
  const [current, setCurrent] = useState(pages[0].id);
  const page = useMemo(() => pages.find((p) => p.id === current) ?? pages[0], [current]);
  const Page = page.component;

  return (
    <NavContext.Provider value={{ go: setCurrent }}>
      <div className={`shell ${settings.interfaceV2 ? "shell-card" : ""}`}>
        <Sidebar current={current} onSelect={setCurrent} />
        <main className="content">
          <UpdateBanner />
          <Page />
        </main>
      </div>
    </NavContext.Provider>
  );
}
