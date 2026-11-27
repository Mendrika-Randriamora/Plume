import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, Monitor } from "@/core/ui";
import { bytes, bytesToGigabytes, gigabytes } from "@/core/format";
import { systemInfo } from "../api";
import type { SystemInfo } from "../types";

interface Row {
  key: string;
  label: string;
  value: string;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="system-about-row">
      <span className="system-about-label">{label}</span>
      <span className="system-about-value">{value}</span>
    </div>
  );
}

/**
 * Carte « À propos » des réglages : logo de la distribution à gauche,
 * informations matérielles et logicielles à droite. Le logo (SVG brut ou
 * `data:` PNG) est affiché tel quel : le dessin vient de la source fournie.
 */
export function SystemAbout() {
  const { t } = useTranslation();
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    systemInfo()
      .then((value) => {
        if (!cancelled) setInfo(value);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) return null;

  const pending = "…";

  const sessionLabel = (value: string) =>
    value === "wayland"
      ? t("settings.about.wayland")
      : value === "x11"
        ? t("settings.about.x11")
        : value;

  const hardware: Row[] = [
    { key: "model", label: t("settings.about.model"), value: info?.model ?? pending },
    {
      key: "memory",
      label: t("settings.about.memory"),
      value: info ? gigabytes(bytesToGigabytes(info.memory)) : pending,
    },
    {
      key: "processor",
      label: t("settings.about.processor"),
      value: info ? `${info.processor} × ${info.cores}` : pending,
    },
    ...(info?.gpus ?? []).map((gpu, index) => ({
      key: `gpu-${index}`,
      label: index === 0 ? t("settings.about.graphics") : t("settings.about.graphicsN", { index }),
      value: gpu,
    })),
    {
      key: "disk",
      label: t("settings.about.disk"),
      value: info ? bytes(info.diskTotal) : pending,
    },
  ];

  const software: Row[] = [
    ...(info?.firmware
      ? [{ key: "firmware", label: t("settings.about.firmware"), value: info.firmware }]
      : []),
    { key: "os", label: t("settings.about.osName"), value: info?.osName ?? pending },
    {
      key: "bits",
      label: t("settings.about.osType"),
      value: info ? (info.osBits ? t("settings.about.bits", { bits: info.osBits }) : "—") : pending,
    },
    ...(info?.gnomeVersion
      ? [{ key: "gnome", label: t("settings.about.gnome"), value: info.gnomeVersion }]
      : []),
    ...(info?.session
      ? [{ key: "session", label: t("settings.about.session"), value: sessionLabel(info.session) }]
      : []),
    {
      key: "kernel",
      label: t("settings.about.kernel"),
      value: info ? (info.kernel ?? "—") : pending,
    },
  ];

  // Le backend renvoie l'URI SVG brute ou une URL `data:` pour un PNG : on
  // l'affiche telle quelle, sans masque.
  const rawLogo = info?.logo ?? null;
  const logoUrl = rawLogo
    ? rawLogo.trimStart().startsWith("<")
      ? `data:image/svg+xml,${encodeURIComponent(rawLogo)}`
      : rawLogo
    : null;

  return (
    <Card>
      <div className="system-about">
        <div className="system-about-logo" aria-hidden="true">
          {logoUrl ? (
            <img className="system-about-img" src={logoUrl} alt="" />
          ) : (
            <Monitor size={84} strokeWidth={1.25} />
          )}
        </div>
        <div className="system-about-cols">
          <section>
            <h2>{t("settings.about.hardware")}</h2>
            {hardware.map((row) => (
              <InfoRow key={row.key} label={row.label} value={row.value} />
            ))}
          </section>
          <section>
            <h2>{t("settings.about.software")}</h2>
            {software.map((row) => (
              <InfoRow key={row.key} label={row.label} value={row.value} />
            ))}
          </section>
        </div>
      </div>
    </Card>
  );
}
