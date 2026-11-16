import { useCallback, useEffect, useState } from "react";
import { ArrowLeftRight, Cpu, HardDrive, MemoryStick, RefreshCw } from "lucide-react";
import { bytes, pct } from "@/core/format";
import { Button, Card, Loading, Notice, PageHeader } from "@/core/ui";
import { usePermission } from "@/core/settings/SettingsProvider";
import { homeHighlights, reveal, systemStats } from "./api";
import { FileList } from "./components/FileList";
import { ObsoleteCard } from "./components/ObsoleteCard";
import { Stat } from "./components/Stat";
import type { FileEntry, Highlights, SystemStats } from "./types";

const deg = (t: number | null) => (t === null ? null : `${Math.round(t)} °C`);

export function HomePage() {
  const canScan = usePermission("scanHome");
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [hl, setHl] = useState<Highlights | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    ? ([["Processeur", stats.temps.cpu], ["Carte graphique", stats.temps.gpu], ["Mémoire", stats.temps.ram]] as const)
        .map(([l, t]) => [l, deg(t)] as const)
        .filter(([, t]) => t)
    : [];

  return (
    <>
      <PageHeader title="Accueil" subtitle="L'état de votre ordinateur, en un coup d'œil." />
      {error && <Notice>{error}</Notice>}

      {temps.length > 0 ? (
        <p className="chips">
          {temps.map(([l, t]) => (
            <span key={l} className="chip">{l} · {t}</span>
          ))}
        </p>
      ) : stats && (
        <p className="chips"><span className="chip muted">Aucun capteur de température détecté</span></p>
      )}

      <div className="grid-3">
        <Stat
          icon={MemoryStick}
          label="Mémoire"
          value={stats ? `${stats.ramUsed.toFixed(2)} Go` : "…"}
          detail={stats ? `utilisée sur ${stats.ramTotal.toFixed(2)} Go` : undefined}
          meter={stats ? pct(stats.ramUsed, stats.ramTotal) : 0}
        />
        <Stat
          icon={ArrowLeftRight}
          label="Espace d'échange"
          value={stats ? (stats.swapTotal ? `${stats.swapUsed.toFixed(2)} Go` : "Aucun") : "…"}
          detail={stats ? (stats.swapTotal ? `utilisé sur ${stats.swapTotal.toFixed(2)} Go` : "Aucun espace configuré") : undefined}
          meter={stats ? pct(stats.swapUsed, stats.swapTotal) : 0}
        />
        <Stat
          icon={HardDrive}
          label="Espace libre"
          value={stats ? bytes(stats.diskFree) : "…"}
          detail={stats ? `sur ${bytes(stats.diskTotal)}` : undefined}
          meter={stats ? 100 - pct(stats.diskFree, stats.diskTotal) : 0}
        />
      </div>

      <Card title="Ce qui utilise la mémoire" hint="Les 5 programmes les plus gourmands en ce moment.">
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
          <Card title="Fichiers les plus lourds" hint="Cliquez pour ouvrir le dossier.">
            {!hl ? <Loading text="Analyse de votre dossier personnel…" /> : <FileList files={hl.heavy} onOpen={open} />}
          </Card>
          <Card
            title="Lourds et oubliés"
            hint="Gros fichiers que vous n'ouvrez plus."
            action={<Button variant="ghost" icon={RefreshCw} busy={loading} onClick={scan} aria-label="Relancer l'analyse" />}
          >
            {!hl ? <Loading text="Analyse…" /> : <FileList files={hl.unused} showDate onOpen={open} />}
          </Card>
        </div>
      ) : (
        <Notice>L{`'`}analyse de votre dossier personnel est désactivée dans les Réglages.</Notice>
      )}

      <ObsoleteCard />
    </>
  );
}
