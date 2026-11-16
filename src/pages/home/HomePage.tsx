import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeftRight, Cpu, HardDrive, MemoryStick, RefreshCw } from "lucide-react";
import { bytes, gigabytes, pct } from "@/core/format";
import { Button, Card, Loading, Notice, PageHeader } from "@/core/ui";
import { usePermission } from "@/core/settings/SettingsProvider";
import { homeHighlights, reveal, systemStats } from "./api";
import { FileList } from "./components/FileList";
import { ObsoleteCard } from "./components/ObsoleteCard";
import { Stat } from "./components/Stat";
import type { FileEntry, Highlights, SystemStats } from "./types";

export function HomePage() {
  const { t } = useTranslation();
  const canScan = usePermission("scanHome");
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [hl, setHl] = useState<Highlights | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deg = (temp: number | null) =>
    temp === null ? null : t("common.celsius", { value: Math.round(temp) });

  useEffect(() => {
    const tick = () => systemStats().then(setStats).catch((e) => setError(e.message));
    tick();
    const id = setInterval(tick, 5000);
    return () => clearInterval(id);
  }, []);

  const scan = useCallback(() => {
    if (!canScan) return;
    setLoading(true);
    homeHighlights().then(setHl).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, [canScan]);
  useEffect(scan, [scan]);

  const open = (f: FileEntry) => reveal(f.path).catch((e) => setError(e.message));

  const temps = stats
    ? ([
        [t("common.cpu"), stats.temps.cpu],
        [t("common.gpu"), stats.temps.gpu],
        [t("common.memory"), stats.temps.ram],
      ] as const)
        .map(([l, temp]) => [l, deg(temp)] as const)
        .filter(([, temp]) => temp)
    : [];

  return (
    <>
      <PageHeader title={t("home.title")} subtitle={t("home.subtitle")} />
      {error && <Notice>{error}</Notice>}

      {temps.length > 0 ? (
        <p className="chips">
          {temps.map(([l, temp]) => (
            <span key={l} className="chip">{l} · {temp}</span>
          ))}
        </p>
      ) : stats && (
        <p className="chips"><span className="chip muted">{t("home.temps.none")}</span></p>
      )}

      <div className="grid-3">
        <Stat
          icon={MemoryStick}
          label={t("common.memory")}
          value={stats ? gigabytes(stats.ramUsed) : "…"}
          detail={stats ? t("home.memory.detail", { total: gigabytes(stats.ramTotal) }) : undefined}
          meter={stats ? pct(stats.ramUsed, stats.ramTotal) : 0}
        />
        <Stat
          icon={ArrowLeftRight}
          label={t("common.swap")}
          value={stats ? (stats.swapTotal ? gigabytes(stats.swapUsed) : t("common.none")) : "…"}
          detail={
            stats
              ? stats.swapTotal
                ? t("home.swap.detail", { total: gigabytes(stats.swapTotal) })
                : t("home.swap.none")
              : undefined
          }
          meter={stats ? pct(stats.swapUsed, stats.swapTotal) : 0}
        />
        <Stat
          icon={HardDrive}
          label={t("home.disk.free")}
          value={stats ? bytes(stats.diskFree) : "…"}
          detail={stats ? t("home.disk.detail", { total: bytes(stats.diskTotal) }) : undefined}
          meter={stats ? 100 - pct(stats.diskFree, stats.diskTotal) : 0}
        />
      </div>

      <Card title={t("home.apps.title")} hint={t("home.apps.hint")}>
        {!stats ? <Loading /> : (
          <ul className="list">
            {stats.topApps.map((a) => (
              <li key={a.name} className="list-row static">
                <Cpu size={16} strokeWidth={1.75} />
                <span className="grow ellipsis">{a.name}</span>
                <span>{bytes(a.memory)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {canScan ? (
        <div className="grid-2">
          <Card title={t("home.heavy.title")} hint={t("home.heavy.hint")}>
            {!hl ? <Loading text={t("home.heavy.loading")} /> : <FileList files={hl.heavy} onOpen={open} />}
          </Card>
          <Card
            title={t("home.unused.title")}
            hint={t("home.unused.hint")}
            action={<Button variant="ghost" icon={RefreshCw} busy={loading} onClick={scan} aria-label={t("home.unused.refresh")} />}
          >
            {!hl ? <Loading text={t("home.unused.loading")} /> : <FileList files={hl.unused} showDate onOpen={open} />}
          </Card>
        </div>
      ) : (
        <Notice>{t("home.scanDisabled")}</Notice>
      )}

      <ObsoleteCard />
    </>
  );
}
