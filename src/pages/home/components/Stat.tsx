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
  return (
    <div className="card stat">
      <div className="stat-label muted small">
        <Icon size={15} strokeWidth={1.75} /> {label}
      </div>
      <div className="stat-value">{value}</div>
      {meter !== undefined && <Meter value={meter} />}
      {detail && <div className="muted small">{detail}</div>}
    </div>
  );
}
