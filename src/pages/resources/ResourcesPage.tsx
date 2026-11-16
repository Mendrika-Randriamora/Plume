import { useTranslation } from "react-i18next";
import { bytes, percentValue } from "@/core/format";
import { Notice, PageHeader } from "@/core/ui";
import { Chart, SERIES, useChartTheme } from "@/core/charts";
import { Legend, type LegendItem } from "./components/Legend";
import { ResourceSection } from "./components/ResourceSection";
import { lineOption } from "./charts";
import { useResourcesLive } from "./live";

const share = (part: number, total: number) => (total ? (part / total) * 100 : 0);

export function ResourcesPage() {
  const { t } = useTranslation();
  const theme = useChartTheme();
  // L'historique est relevé en continu par l'application : à l'ouverture, les
  // courbes sont déjà complètes au lieu de se remplir pendant une minute.
  const { latest, history, error } = useResourcesLive();

  const percent = (part: number, total: number) => percentValue(share(part, total), 1);
  const rate = (value: number) => t("common.perSecond", { value: bytes(value) });

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
        { name: t("common.memory"), color: SERIES[0], data: history.map((h) => h.ram) },
        { name: t("common.swap"), color: SERIES[3], data: history.map((h) => h.swap) },
      ],
    },
    theme,
  );

  const networkOption = lineOption(
    {
      labels,
      series: [
        { name: t("common.received"), color: SERIES[4], data: history.map((h) => h.rx) },
        { name: t("common.sent"), color: SERIES[1], data: history.map((h) => h.tx) },
      ],
    },
    theme,
  );

  const diskOption = lineOption(
    {
      labels,
      series: [
        { name: t("common.read"), color: SERIES[4], data: history.map((h) => h.read) },
        { name: t("common.write"), color: SERIES[1], data: history.map((h) => h.write) },
      ],
    },
    theme,
  );

  const cpuLegend: LegendItem[] = latest
    ? latest.cpuCores.map((usage, i) => ({
        color: SERIES[i % SERIES.length],
        label: `CPU ${i + 1}`,
        value: percentValue(usage, 1),
      }))
    : [];

  const memoryLegend: LegendItem[] = [
    {
      color: SERIES[0],
      label: t("common.memory"),
      value: latest ? `${bytes(latest.ramUsed)} (${percent(latest.ramUsed, latest.ramTotal)})` : "…",
      detail: latest ? t("resources.on", { total: bytes(latest.ramTotal) }) : undefined,
    },
    {
      color: SERIES[3],
      label: t("common.swap"),
      value: latest
        ? latest.swapTotal
          ? `${bytes(latest.swapUsed)} (${percent(latest.swapUsed, latest.swapTotal)})`
          : t("common.none")
        : "…",
      detail: latest && latest.swapTotal ? t("resources.on", { total: bytes(latest.swapTotal) }) : undefined,
    },
  ];

  const networkLegend: LegendItem[] = [
    {
      color: SERIES[4],
      label: t("common.received"),
      value: latest ? rate(latest.netRx) : "…",
      detail: latest ? t("resources.network.totalReceived", { total: bytes(latest.netRxTotal) }) : undefined,
    },
    {
      color: SERIES[1],
      label: t("common.sent"),
      value: latest ? rate(latest.netTx) : "…",
      detail: latest ? t("resources.network.totalSent", { total: bytes(latest.netTxTotal) }) : undefined,
    },
  ];

  const diskLegend: LegendItem[] = [
    {
      color: SERIES[4],
      label: t("common.read"),
      value: latest ? rate(latest.diskRead) : "…",
      detail: latest ? t("resources.disk.totalRead", { total: bytes(latest.diskReadTotal) }) : undefined,
    },
    {
      color: SERIES[1],
      label: t("common.write"),
      value: latest ? rate(latest.diskWrite) : "…",
      detail: latest ? t("resources.disk.totalWritten", { total: bytes(latest.diskWriteTotal) }) : undefined,
    },
  ];

  return (
    <>
      <PageHeader title={t("resources.title")} subtitle={t("resources.subtitle")} />
      {error && <Notice>{error}</Notice>}

      <ResourceSection
        title={t("common.cpu")}
        hint={
          latest
            ? t("resources.cpu.hint", {
                percent: percentValue(latest.cpuGlobal, 0),
                count: cores,
              })
            : undefined
        }
      >
        <Chart option={cpuOption} height={240} />
        <Legend items={cpuLegend} />
      </ResourceSection>

      <ResourceSection title={t("resources.memorySwap.title")}>
        <Chart option={memoryOption} height={180} />
        <Legend items={memoryLegend} />
      </ResourceSection>

      <ResourceSection title={t("common.network")}>
        <Chart option={networkOption} height={180} />
        <Legend items={networkLegend} />
      </ResourceSection>

      <ResourceSection title={t("common.disk")}>
        <Chart option={diskOption} height={180} />
        <Legend items={diskLegend} />
      </ResourceSection>
    </>
  );
}
