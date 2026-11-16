import type { EChartsCoreOption } from "echarts/core";
import { bytes } from "@/core/format";
import type { ChartTheme } from "@/core/charts";

export interface SeriesSpec {
  name: string;
  color: string;
  data: number[];
}

export interface ChartSpec {
  labels: string[];
  series: SeriesSpec[];
  /** Axe en pourcentage (0–100) plutôt qu'en octets. */
  percent?: boolean;
}

/** Options communes aux courbes : même grille et mêmes couleurs que l'application. */
export function lineOption({ labels, series, percent }: ChartSpec, theme: ChartTheme): EChartsCoreOption {
  const format = percent ? (v: number) => `${Math.round(v)} %` : (v: number) => bytes(v);

  return {
    animation: false,
    grid: { left: 4, right: 66, top: 12, bottom: 28 },
    tooltip: {
      trigger: "axis",
      backgroundColor: theme.surface,
      borderColor: theme.line,
      borderWidth: 1,
      padding: [6, 10],
      textStyle: { color: theme.ink, fontSize: 12, fontFamily: theme.font },
      axisPointer: { type: "line", lineStyle: { color: theme.muted, width: 1 } },
      valueFormatter: (value: unknown) => format(Number(value)),
    },
    xAxis: {
      type: "category",
      data: labels,
      boundaryGap: false,
      axisLine: { lineStyle: { color: theme.line } },
      axisTick: { show: false },
      axisLabel: { color: theme.muted, fontSize: 11, fontFamily: theme.font, interval: 20, margin: 10 },
    },
    yAxis: {
      type: "value",
      min: 0,
      max: percent ? 100 : undefined,
      splitNumber: 5,
      position: "right",
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: theme.muted, fontSize: 11, fontFamily: theme.font, formatter: format, margin: 8 },
      splitLine: { lineStyle: { color: theme.line } },
    },
    series: series.map((s) => ({
      type: "line",
      name: s.name,
      data: s.data,
      showSymbol: false,
      smooth: 0.3,
      silent: true,
      lineStyle: { width: 1.4, color: s.color },
      itemStyle: { color: s.color },
    })),
  };
}
