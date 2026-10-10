import { useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Loader2, type LucideIcon } from "lucide-react";

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
  icon?: LucideIcon;
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
export function ConfirmButton({ label, confirmLabel = "Confirmer", onConfirm, busy, disabled, icon }: {
  label: string;
  confirmLabel?: string;
  onConfirm: () => void;
  busy?: boolean;
  disabled?: boolean;
  icon?: LucideIcon;
}) {
  const [armed, setArmed] = useState(false);
  if (!armed) return <Button icon={icon} disabled={disabled} busy={busy} onClick={() => setArmed(true)}>{label}</Button>;
  return (
    <span className="row gap">
      <Button onClick={() => { setArmed(false); onConfirm(); }}>{confirmLabel}</Button>
      <Button variant="ghost" onClick={() => setArmed(false)}>Annuler</Button>
    </span>
  );
}

export function Meter({ value }: { value: number }) {
  return (
    <div className="meter">
      <div style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

export function Empty({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <div className="empty">
      <Icon size={22} strokeWidth={1.5} />
      <p>{text}</p>
    </div>
  );
}

export function Loading({ text = "Chargement…" }: { text?: string }) {
  return (
    <div className="empty">
      <Loader2 size={20} className="spin" />
      <p>{text}</p>
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
