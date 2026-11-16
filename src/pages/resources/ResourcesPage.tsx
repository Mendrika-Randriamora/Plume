import { useEffect, useState } from "react";
import { bytes } from "@/core/format";
import { Notice, PageHeader } from "@/core/ui";
import { Chart, SERIES, useChartTheme } from "@/core/charts";
import { Legend, type LegendItem } from "./components/Legend";
import { ResourceSection } from "./components/ResourceSection";
import { lineOption } from "./charts";
import { resourceSnapshot } from "./api";
import type { ResourceSample, ResourceSnapshot } from "./types";

/** Historique affiché : une minute, un point par seconde. */
const HISTORY = 60;

const share = (part: number, total: number) => (total ? (part / total) * 100 : 0);
const percent = (part: number, total: number) => `${share(part, total).toFixed(1)} %`;
const rate = (value: number) => `${bytes(value)}/s`;

const toSample = (s: ResourceSnapshot): ResourceSample => ({
  cpu: s.cpuCores,
  ram: share(s.ramUsed, s.ramTotal),
  swap: share(s.swapUsed, s.swapTotal),
  rx: s.netRx,
  tx: s.netTx,
  read: s.diskRead,
  write: s.diskWrite,
});

export function ResourcesPage() {
  const theme = useChartTheme();
  const [latest, setLatest] = useState<ResourceSnapshot | null>(null);
  const [history, setHistory] = useState<ResourceSample[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = () =>
      resourceSnapshot()
        .then((snapshot) => {
          if (!alive) return;
          setLatest(snapshot);
          setHistory((h) => [...h, toSample(snapshot)].slice(-HISTORY));
        })
        .catch((e) => {
          if (alive) setError((e as Error).message);
        });
    tick();
    const id = setInterval(tick, 1000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const labels = history.map((_, i) => `${i + 1 - history.length} s`);
  const cores = latest?.cpuCores.length ?? 0;

  const cpuOption = lineOption(
    {
      labels,
      percent: true,
      series: Array.from({ length: cores }, (_, i) => ({
        name: `CPU ${i + 1}`,
        color: SERIES[i % SERIES.length],
        data: history.map((h) => h.cpu[i] ?? 0),
      })),
    },
    theme,
  );

  const memoryOption = lineOption(
    {
      labels,
      percent: true,
      series: [
        { name: "Mémoire", color: SERIES[0], data: history.map((h) => h.ram) },
        { name: "Espace d'échange", color: SERIES[3], data: history.map((h) => h.swap) },
      ],
    },
    theme,
  );

  const networkOption = lineOption(
    {
      labels,
      series: [
        { name: "Réception", color: SERIES[4], data: history.map((h) => h.rx) },
        { name: "Envoi", color: SERIES[1], data: history.map((h) => h.tx) },
      ],
    },
    theme,
  );

  const diskOption = lineOption(
    {
      labels,
      series: [
        { name: "Lecture", color: SERIES[4], data: history.map((h) => h.read) },
        { name: "Écriture", color: SERIES[1], data: history.map((h) => h.write) },
      ],
    },
    theme,
  );

  const cpuLegend: LegendItem[] = latest
    ? latest.cpuCores.map((usage, i) => ({
        color: SERIES[i % SERIES.length],
        label: `CPU ${i + 1}`,
        value: `${usage.toFixed(1)} %`,
      }))
    : [];

  const memoryLegend: LegendItem[] = [
    {
      color: SERIES[0],
      label: "Mémoire",
      value: latest ? `${bytes(latest.ramUsed)} (${percent(latest.ramUsed, latest.ramTotal)})` : "…",
      detail: latest ? `sur ${bytes(latest.ramTotal)}` : undefined,
    },
    {
      color: SERIES[3],
      label: "Espace d'échange",
      value: latest
        ? latest.swapTotal
          ? `${bytes(latest.swapUsed)} (${percent(latest.swapUsed, latest.swapTotal)})`
          : "Aucun"
        : "…",
      detail: latest && latest.swapTotal ? `sur ${bytes(latest.swapTotal)}` : undefined,
    },
  ];

  const networkLegend: LegendItem[] = [
    {
      color: SERIES[4],
      label: "Réception",
      value: latest ? rate(latest.netRx) : "…",
      detail: latest ? `Total reçu ${bytes(latest.netRxTotal)}` : undefined,
    },
    {
      color: SERIES[1],
      label: "Envoi",
      value: latest ? rate(latest.netTx) : "…",
      detail: latest ? `Total envoyé ${bytes(latest.netTxTotal)}` : undefined,
    },
  ];

  const diskLegend: LegendItem[] = [
    {
      color: SERIES[4],
      label: "Lecture",
      value: latest ? rate(latest.diskRead) : "…",
      detail: latest ? `Total lu ${bytes(latest.diskReadTotal)}` : undefined,
    },
    {
      color: SERIES[1],
      label: "Écriture",
      value: latest ? rate(latest.diskWrite) : "…",
      detail: latest ? `Total écrit ${bytes(latest.diskWriteTotal)}` : undefined,
    },
  ];

  return (
    <>
      <PageHeader title="Ressources" subtitle="L'activité de votre ordinateur en temps réel, sur la dernière minute." />
      {error && <Notice>{error}</Notice>}

      <ResourceSection
        title="Processeur"
        hint={latest ? `${latest.cpuGlobal.toFixed(0)} % au total · ${cores} cœur${cores > 1 ? "s" : ""}` : undefined}
      >
        <Chart option={cpuOption} height={240} />
        <Legend items={cpuLegend} />
      </ResourceSection>

      <ResourceSection title="Mémoire et espace d'échange">
        <Chart option={memoryOption} height={180} />
        <Legend items={memoryLegend} />
      </ResourceSection>

      <ResourceSection title="Réseau">
        <Chart option={networkOption} height={180} />
        <Legend items={networkLegend} />
      </ResourceSection>

      <ResourceSection title="Disque">
        <Chart option={diskOption} height={180} />
        <Legend items={diskLegend} />
      </ResourceSection>
    </>
  );
}
