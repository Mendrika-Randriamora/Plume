import { useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "./icons";
import type { AppIcon } from "./icons";

export {
  Activity,
  ArrowLeft,
  ArrowLeftRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleAlert,
  Cpu,
  Copy,
  Diff,
  Download,
  FileCode,
  FileText,
  Folder,
  FolderOpen,
  FolderTree,
  Grid3X3,
  GripVertical,
  HardDrive,
  Home,
  Info,
  Loader2,
  Lock,
  MemoryStick,
  Minus,
  Monitor,
  Package,
  PackageCheck,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Power,
  PowerOff,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Save,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Square,
  SquarePlay,
  Star,
  Trash2,
  TriangleAlert,
  X,
} from "./icons";
export type { AppIcon, AppIconProps } from "./icons";

export function Card({ title, hint, action, children }: { title?: string; hint?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="card">
      {(title || action) && (
        <header className="card-head">
          <div>
            {title && <h2>{title}</h2>}
            {hint && <p className="muted small">{hint}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: AppIcon;
  busy?: boolean;
  variant?: "solid" | "ghost";
}

export function Button({ icon: Icon, busy, variant = "solid", children, ...rest }: BtnProps) {
  return (
    <button {...rest} disabled={rest.disabled || busy} className={`btn ${variant} ${rest.className ?? ""}`}>
      {busy ? <Loader2 size={16} className="spin" /> : Icon ? <Icon size={16} strokeWidth={1.75} /> : null}
      {children}
    </button>
  );
}

/** Bouton en deux temps : évite les suppressions accidentelles sans fenêtre pop-up. */
export function ConfirmButton({ label, confirmLabel, onConfirm, busy, disabled, icon, iconOnly }: {
  label: string;
  confirmLabel?: string;
  onConfirm: () => void;
  busy?: boolean;
  disabled?: boolean;
  icon?: AppIcon;
  iconOnly?: boolean;
}) {
  const { t } = useTranslation();
  const [armed, setArmed] = useState(false);
  if (!armed) {
    return (
      <Button
        icon={icon}
        variant={iconOnly ? "ghost" : "solid"}
        className={iconOnly ? "icon-btn" : undefined}
        disabled={disabled}
        busy={busy}
        aria-label={iconOnly ? label : undefined}
        title={iconOnly ? label : undefined}
        onClick={() => setArmed(true)}
      >
        {iconOnly ? null : label}
      </Button>
    );
  }
  return (
    <span className="row gap">
      <Button disabled={disabled} busy={busy} onClick={() => { setArmed(false); onConfirm(); }}>{confirmLabel ?? t("common.confirm")}</Button>
      <Button variant="ghost" disabled={busy} onClick={() => setArmed(false)}>{t("common.cancel")}</Button>
    </span>
  );
}

export function Meter({ value, tone }: { value: number; tone?: "warn" | "danger" }) {
  return (
    <div className={`meter${tone ? ` ${tone}` : ""}`}>
      <div style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

export function Empty({ icon: Icon, text }: { icon: AppIcon; text: string }) {
  return (
    <div className="empty">
      <Icon size={22} strokeWidth={1.5} />
      <p>{text}</p>
    </div>
  );
}

export function Loading({ text }: { text?: string }) {
  const { t } = useTranslation();
  return (
    <div className="empty">
      <Loader2 size={20} className="spin" />
      <p>{text ?? t("common.loading")}</p>
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle: string; action?: ReactNode }) {
  return (
    <header className="page-head">
      <div>
        <h1>{title}</h1>
        <p className="muted">{subtitle}</p>
      </div>
      {action}
    </header>
  );
}

export function Notice({ children }: { children: ReactNode }) {
  return <div className="notice">{children}</div>;
}
