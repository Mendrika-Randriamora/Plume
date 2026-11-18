import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Meter } from "@/core/ui";

export function Stat({ icon: Icon, label, value, detail, meter }: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  detail?: string;
  meter?: number;
}) {
  // <50 % : couleur neutre ; 50–75 % : orange ; ≥75 % : rouge.
  const tone = meter === undefined ? undefined : meter >= 75 ? "danger" : meter >= 50 ? "warn" : undefined;

  return (
    <div className="card stat">
      <div className="stat-label muted small">
        <Icon size={15} strokeWidth={1.75} /> {label}
      </div>
      <div className={`stat-value${tone ? ` ${tone}` : ""}`}>{value}</div>
      {meter !== undefined && <Meter value={meter} tone={tone} />}
      {detail && <div className="muted small">{detail}</div>}
    </div>
  );
}
