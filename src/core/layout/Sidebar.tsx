import { pages } from "@/pages/registry";

interface Props {
  current: string;
  onSelect: (id: string) => void;
}

export function Sidebar({ current, onSelect }: Props) {
  const render = (id: string, label: string, Icon: (typeof pages)[number]["icon"]) => (
    <button key={id} className={`nav-item ${current === id ? "active" : ""}`} onClick={() => onSelect(id)}>
      <Icon size={18} strokeWidth={1.75} />
      <span>{label}</span>
    </button>
  );
  return (
    <nav className="sidebar">
      <div className="brand">Plume</div>
      <div className="nav-group">
        {pages.filter((p) => p.position !== "bottom").map((p) => render(p.id, p.label, p.icon))}
      </div>
      <div className="nav-group bottom">
        {pages.filter((p) => p.position === "bottom").map((p) => render(p.id, p.label, p.icon))}
      </div>
    </nav>
  );
}
