import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "@/core/ui";

/** Section repliable, comme dans le moniteur système de GNOME. */
export function ResourceSection({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  const [open, setOpen] = useState(true);

  return (
    <section className="card">
      <button className="section-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <h2>{title}</h2>
        {hint && <span className="muted small">{hint}</span>}
      </button>
      {open && <div className="section-body">{children}</div>}
    </section>
  );
}
