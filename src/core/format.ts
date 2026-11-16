import i18n, { translate } from "@/core/i18n";

const BYTE_UNITS = ["units.kb", "units.mb", "units.gb", "units.tb"] as const;

function number(value: number, digits: number): string {
  return new Intl.NumberFormat(i18n.language, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

/** Taille lisible, avec unités et séparateur décimal de la langue courante. */
export function bytes(n: number | null | undefined): string {
  if (n === undefined || n === null) return "-";
  if (n < 1000) return `${number(n, 0)} ${translate("units.byte")}`;

  let v = n / 1000;
  let i = 0;
  while (v >= 1000 && i < BYTE_UNITS.length - 1) {
    v /= 1000;
    i++;
  }
  return `${number(v, v >= 100 ? 0 : 1)} ${translate(BYTE_UNITS[i])}`;
}

/** Valeur déjà exprimée en gigaoctets (mémoire, espace d'échange). */
export function gigabytes(n: number): string {
  return `${number(n, 2)} ${translate("units.gb")}`;
}

/** Pourcentage (0–100) formaté par Intl : espace et virgule propres à la langue. */
export function percentValue(value: number, digits = 1): string {
  return new Intl.NumberFormat(i18n.language, {
    style: "percent",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value / 100);
}

/** Date longue (« 12 novembre 2026 » / « November 12, 2026 »). */
export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(i18n.language, {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

/** Durée relative localisée (« il y a 12 jours » / « 12 days ago »). */
export function ago(unixSecs: number): string {
  if (!unixSecs) return translate("common.unknownDate");

  const days = Math.floor((Date.now() / 1000 - unixSecs) / 86400);
  const relative = new Intl.RelativeTimeFormat(i18n.language, { numeric: "auto" });
  if (days < 1) return relative.format(0, "day");
  if (days < 30) return relative.format(-days, "day");
  if (days < 365) return relative.format(-Math.floor(days / 30), "month");
  return relative.format(-Math.floor(days / 365), "year");
}

export const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
