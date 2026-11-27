import { useTranslation } from "react-i18next";

type Summary =
  | { kind: "hourly" }
  | { kind: "daily"; time: string }
  | { kind: "weekdays"; time: string }
  | { kind: "weekly"; day: keyof typeof DAY_KEYS; time: string }
  | { kind: "custom" };

const DAY_KEYS = {
  sun: "startup.days.sun",
  mon: "startup.days.mon",
  tue: "startup.days.tue",
  wed: "startup.days.wed",
  thu: "startup.days.thu",
  fri: "startup.days.fri",
  sat: "startup.days.sat",
} as const;

const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

const pad = (value: number) => String(value).padStart(2, "0");

function number(value: string): number | null {
  return /^\d{1,2}$/.test(value) ? Number(value) : null;
}

function at(hour: string, minute: string): string | null {
  const h = number(hour);
  const m = number(minute);
  if (h === null || m === null || h > 23 || m > 59) return null;
  return `${pad(h)}:${pad(m)}`;
}

/**
 * Résume une expression cron de 5 champs en français lisible. Tout ce qui sort
 * des formes simples est présenté comme une planification personnalisée.
 */
export function describeCron(expr: string): Summary {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) return { kind: "custom" };

  const [minute, hour, dayOfMonth, month, dayOfWeek] = fields;
  if (month !== "*" || dayOfMonth !== "*") return { kind: "custom" };

  if (dayOfWeek === "*") {
    if (minute === "*" && hour === "*") return { kind: "hourly" };
    const time = at(hour, minute);
    return time ? { kind: "daily", time } : { kind: "custom" };
  }

  const time = at(hour, minute);
  if (!time) return { kind: "custom" };
  if (dayOfWeek === "1-5") return { kind: "weekdays", time };

  const day = number(dayOfWeek);
  if (day !== null && day <= 6) return { kind: "weekly", day: DAYS[day], time };
  return { kind: "custom" };
}

/** Planification traduite, par exemple « Tous les jours à 09:00 ». */
export function ScheduleText({ expr }: { expr: string }) {
  const { t } = useTranslation();
  const summary = describeCron(expr);

  switch (summary.kind) {
    case "hourly":
      return <>{t("startup.summary.hourly")}</>;
    case "daily":
      return <>{t("startup.summary.daily", { time: summary.time })}</>;
    case "weekdays":
      return <>{t("startup.summary.weekdays", { time: summary.time })}</>;
    case "weekly":
      return (
        <>
          {t("startup.summary.weekly", {
            day: t(DAY_KEYS[summary.day]),
            time: summary.time,
          })}
        </>
      );
    default:
      return <>{t("startup.summary.custom")}</>;
  }
}
