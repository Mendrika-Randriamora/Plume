import { useMemo, useState } from "react";
import { pages } from "@/pages/registry";
import { Sidebar } from "@/core/layout/Sidebar";
import { NavContext } from "@/core/layout/nav";

export default function App() {
  const [current, setCurrent] = useState(pages[0].id);
  const page = useMemo(() => pages.find((p) => p.id === current) ?? pages[0], [current]);
  const Page = page.component;

  return (
    <NavContext.Provider value={{ go: setCurrent }}>
      <div className="shell">
        <Sidebar current={current} onSelect={setCurrent} />
        <main className="content">
          <Page />
        </main>
      </div>
    </NavContext.Provider>
  );
}
