/** Converte uma ChartSpec em opção do ECharts. Só desenho e formatação; nenhum indicador é calculado aqui. */
import type { EChartsOption } from "echarts";
import { EVENT_CATEGORY_COLORS, SEVERITY_COLORS } from "@/lib/colors";
import type { ChartSpec, SeriesSpec, XValue } from "./types";

const nf = (d: number) => new Intl.NumberFormat("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

function fmtX(x: XValue, kind: ChartSpec["kind"], xType?: string): string {
  if (typeof x === "string" && /^\d{4}-\d{2}-\d{2}/.test(x)) {
    const s = x.slice(0, 10);
    const time = x.length > 10 ? ` ${new Date(x).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Fortaleza" })}` : "";
    return `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}${time}`;
  }
  if (kind === "age" && typeof x === "number") return `${nf(Number.isInteger(x) ? 0 : 1).format(x)} semanas`;
  if (kind === "shelf" && typeof x === "number") return `dia ${x}`;
  if (xType === "value" && typeof x === "number") return nf(2).format(x);
  return String(x);
}

function fmtY(v: unknown, decimals: number, unit?: string) {
  if (v == null || (typeof v === "number" && !Number.isFinite(v))) return "—";
  const n = Array.isArray(v) ? v[1] : v;
  if (n == null) return "—";
  const s = nf(decimals).format(Number(n));
  if (!unit) return s;
  if (unit === "R$") return `R$ ${s}`;
  if (unit === "%") return `${s}%`;
  return `${s} ${unit}`;
}

function baseSeries(s: SeriesSpec, spec: ChartSpec): Record<string, unknown> {
  const color = s.muted ? "#cbd5e1" : s.color;
  return {
    name: s.name,
    type: s.type ?? "line",
    data: s.data,
    yAxisIndex: s.yAxis ?? 0,
    stack: s.stack,
    showSymbol: s.symbol ?? (s.type === "scatter" ? true : false),
    symbolSize: s.type === "scatter" ? 7 : 4,
    smooth: s.smooth ?? false,
    step: s.step ? "middle" : undefined,
    connectNulls: false,
    itemStyle: color ? { color } : undefined,
    lineStyle: s.type === "line" || !s.type ? { width: s.width ?? (s.muted ? 1 : 2), type: s.dashed ? "dashed" : s.dotted ? "dotted" : "solid", color } : undefined,
    areaStyle: s.area ? { opacity: 0.15 } : undefined,
    z: s.muted ? 1 : 3,
    emphasis: { focus: "series" },
    barMaxWidth: 28,
    silent: s.muted ? true : undefined,
    ...(spec.kind === "timeseries" && s.type !== "bar" ? { sampling: "lttb" } : {}),
  };
}

export function buildOption(spec: ChartSpec): EChartsOption {
  const decimals = spec.decimals ?? 1;
  const isTime = spec.xType === "time" || ((spec.kind === "timeseries" || spec.kind === "forecast") && spec.xType !== "category");
  const isAge = spec.kind === "age" || spec.kind === "shelf" || spec.xType === "value";
  const grid = { left: 8, right: spec.series.some((s) => s.yAxis === 1) ? 8 : 16, top: spec.compact ? 30 : 28, bottom: spec.compact ? 8 : isTime ? 52 : 28, containLabel: true };

  // --- Mapa de calor
  if (spec.kind === "heatmap" && spec.heat) {
    const h = spec.heat;
    const vals = h.values.map((v) => v[2]).filter((v): v is number => v != null);
    return {
      grid: { left: 8, right: 16, top: 8, bottom: 56, containLabel: true },
      tooltip: {
        position: "top",
        formatter: (p: unknown) => {
          const d = (p as { data: [number, number, number | null] }).data;
          return `${h.y[d[1]]} · ${fmtX(h.x[d[0]], spec.kind)}<br/><b>${fmtY(d[2], decimals, spec.unit)}</b>`;
        },
      },
      xAxis: { type: "category", data: h.x, axisLabel: { formatter: (v: string) => (/^\d{4}-/.test(v) ? `${v.slice(8, 10)}/${v.slice(5, 7)}` : v) }, splitArea: { show: true } },
      yAxis: { type: "category", data: h.y, splitArea: { show: true } },
      visualMap: {
        min: h.min ?? (vals.length ? Math.min(...vals) : 0),
        max: h.max ?? (vals.length ? Math.max(...vals) : 1),
        calculable: true,
        orient: "horizontal",
        left: "center",
        bottom: 0,
        itemHeight: 120,
        inRange: { color: h.colors ?? ["#f0fdf4", "#fde68a", "#f97316", "#b91c1c"] },
        formatter: (v: unknown) => nf(decimals).format(Number(v)),
      },
      series: [{ type: "heatmap", data: h.values.map((v) => [v[0], v[1], v[2] ?? "-"]), label: { show: h.x.length * h.y.length <= 120, formatter: (p: unknown) => fmtY((p as { data: number[] }).data[2], decimals) }, emphasis: { itemStyle: { borderColor: "#111", borderWidth: 1 } } }],
    } as EChartsOption;
  }

  // --- Cascata
  if (spec.kind === "waterfall") {
    const items = spec.series[0]?.data ?? [];
    const cats = items.map((d) => String(d[0]));
    const base: (number | string)[] = [];
    const up: (number | string)[] = [];
    const down: (number | string)[] = [];
    const total: (number | string)[] = [];
    let run = 0;
    items.forEach(([, v], i) => {
      const val = v ?? 0;
      const isTotal = i === 0 || i === items.length - 1;
      if (isTotal) {
        total.push(val);
        base.push("-");
        up.push("-");
        down.push("-");
        run = val;
      } else {
        total.push("-");
        if (val >= 0) {
          base.push(run);
          up.push(val);
          down.push("-");
        } else {
          base.push(run + val);
          down.push(-val);
          up.push("-");
        }
        run += val;
      }
    });
    return {
      grid,
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (ps: unknown) => {
          const arr = ps as Array<{ dataIndex: number }>;
          const i = arr[0]?.dataIndex ?? 0;
          const v = items[i]?.[1];
          return `${cats[i]}<br/><b>${fmtY(v, decimals, spec.unit)}</b>`;
        },
      },
      xAxis: { type: "category", data: cats, axisLabel: { interval: 0, width: 90, overflow: "break" } },
      yAxis: { type: "value", scale: true, axisLabel: { formatter: (v: number) => nf(decimals).format(v) }, name: spec.unit },
      series: [
        { type: "bar", stack: "w", data: base, itemStyle: { color: "transparent" }, silent: true },
        { type: "bar", stack: "w", data: up, itemStyle: { color: "#16a34a" }, name: "Aumento", label: { show: true, position: "top", formatter: (p: unknown) => fmtY((p as { value: number }).value, decimals) } },
        { type: "bar", stack: "w", data: down, itemStyle: { color: "#dc2626" }, name: "Redução", label: { show: true, position: "bottom", formatter: (p: unknown) => `−${fmtY((p as { value: number }).value, decimals)}` } },
        { type: "bar", stack: "w", data: total, itemStyle: { color: "#6b7280" }, name: "Total", label: { show: true, position: "top", formatter: (p: unknown) => fmtY((p as { value: number }).value, decimals) } },
      ],
    } as EChartsOption;
  }

  // --- Pareto
  if (spec.kind === "pareto") {
    const items = [...(spec.series[0]?.data ?? [])].sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0));
    const totalV = items.reduce((a, d) => a + (d[1] ?? 0), 0) || 1;
    let acc = 0;
    const cum = items.map((d) => {
      acc += d[1] ?? 0;
      return (acc / totalV) * 100;
    });
    return {
      grid: { ...grid, right: 8 },
      tooltip: { trigger: "axis", valueFormatter: (v: unknown) => fmtY(v, decimals, spec.unit) },
      legend: { bottom: 0 },
      xAxis: { type: "category", data: items.map((d) => String(d[0])), axisLabel: { interval: 0, width: 80, overflow: "break" } },
      yAxis: [
        { type: "value", name: spec.unit, axisLabel: { formatter: (v: number) => nf(decimals).format(v) } },
        { type: "value", name: "% acumulado", max: 100, min: 0, axisLabel: { formatter: "{value}%" } },
      ],
      series: [
        { type: "bar", name: spec.series[0]?.name ?? "Valor", data: items.map((d) => d[1]), itemStyle: { color: spec.series[0]?.color ?? "#d97706" }, barMaxWidth: 40 },
        { type: "line", name: "% acumulado", yAxisIndex: 1, clip: false, data: cum, itemStyle: { color: "#1e3a5f" }, tooltip: { valueFormatter: (v: unknown) => `${nf(1).format(Number(v))}%` } },
      ],
    } as EChartsOption;
  }

  // --- Barras (verticais ou horizontais)
  if (spec.kind === "bar" || spec.kind === "hbar") {
    const cats = spec.categories ?? Array.from(new Set(spec.series.flatMap((s) => s.data.map((d) => String(d[0])))));
    const catAxis = { type: "category" as const, data: cats, axisLabel: { interval: 0, width: 90, overflow: "break" as const, rotate: spec.kind === "bar" && cats.length > 8 ? 35 : 0 }, inverse: spec.kind === "hbar" };
    const valAxis = { type: "value" as const, name: spec.unit, axisLabel: { formatter: (v: number) => nf(decimals).format(v) } };
    return {
      grid: { ...grid, bottom: spec.series.length > 1 ? 40 : 24 },
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v: unknown) => fmtY(v, decimals, spec.unit) },
      legend: spec.series.length > 1 ? { bottom: 0, type: "scroll" } : undefined,
      xAxis: spec.kind === "hbar" ? valAxis : catAxis,
      yAxis: spec.kind === "hbar" ? catAxis : valAxis,
      series: spec.series.map((s) => ({
        ...baseSeries({ ...s, type: s.type ?? "bar" }, spec),
        data: cats.map((c) => {
          const di = s.data.findIndex((x) => String(x[0]) === c);
          const v = di >= 0 ? s.data[di][1] : null;
          const custom = di >= 0 ? s.colors?.[di] : null;
          return { value: v, itemStyle: custom ? { color: custom } : undefined };
        }),
        label: spec.series.length === 1 ? { show: cats.length <= 16, position: spec.kind === "hbar" ? "right" : "top", formatter: (p: unknown) => fmtY((p as { value: number }).value, decimals) } : undefined,
        markLine: refMarkLine(spec, spec.kind === "hbar"),
      })),
    } as EChartsOption;
  }

  // --- Linhas por data / idade / valor, com faixas, eventos e alertas
  const series: Record<string, unknown>[] = [];
  (spec.bands ?? []).forEach((b, i) => {
    const stack = `band${i}`;
    const lowerMap = new Map(b.lower.map((d) => [String(d[0]), d[1]]));
    series.push({ name: b.name, type: "line", data: b.lower, stack, lineStyle: { opacity: 0 }, symbol: "none", tooltip: { show: false }, silent: true, z: 0, legendHoverLink: false });
    series.push({
      name: b.name,
      type: "line",
      data: b.upper.map((d) => {
        const lo = lowerMap.get(String(d[0]));
        return [d[0], d[1] != null && lo != null ? d[1] - lo : null];
      }),
      stack,
      lineStyle: { opacity: 0 },
      symbol: "none",
      areaStyle: { color: b.color ?? "rgba(156,163,175,0.28)" },
      tooltip: { show: false },
      silent: true,
      z: 0,
    });
  });
  spec.series.forEach((s, i) => {
    const so = baseSeries(s, spec);
    if (i === 0) {
      const areas = (spec.events ?? []).filter((e) => e.to != null && e.to !== e.from);
      const points = (spec.events ?? []).filter((e) => e.to == null || e.to === e.from);
      if (areas.length) {
        so.markArea = {
          silent: false,
          data: areas.map((e) => [
            { xAxis: e.from, name: e.label, eventId: e.id, itemStyle: { color: hexA(EVENT_CATEGORY_COLORS[e.category] ?? "#334155", 0.12) }, label: { color: EVENT_CATEGORY_COLORS[e.category], fontSize: 10, position: "insideTop" } },
            { xAxis: e.to },
          ]),
        };
      }
      const ml = refMarkLine(spec, false) as { data?: unknown[] } | undefined;
      const evLines = points.map((e) => ({
        xAxis: e.from,
        name: e.label,
        eventId: e.id,
        lineStyle: { color: EVENT_CATEGORY_COLORS[e.category] ?? "#334155", type: "solid", width: 1.5 },
        label: { formatter: "⚑ {b}", color: EVENT_CATEGORY_COLORS[e.category], fontSize: 10, position: "insideEndTop" },
      }));
      if (evLines.length || ml?.data?.length) so.markLine = { symbol: ["none", "none"], silent: false, data: [...(ml?.data ?? []), ...evLines] };
    }
    series.push(so);
  });
  if (spec.alerts?.length) {
    series.push({
      name: "Alertas",
      type: "scatter",
      symbol: "pin",
      symbolSize: 22,
      z: 10,
      data: spec.alerts.map((a) => ({ value: [a.x, a.y], alertId: a.id, name: a.label, itemStyle: { color: SEVERITY_COLORS[a.severity] ?? "#dc2626" } })),
      tooltip: { formatter: (p: unknown) => `Alerta: ${(p as { name: string }).name}` },
    });
  }

  const hasRight = spec.series.some((s) => s.yAxis === 1);
  return {
    grid,
    animation: false,
    tooltip: {
      trigger: "axis",
      confine: true,
      formatter: (ps: unknown) => {
        const arr = (Array.isArray(ps) ? ps : [ps]) as Array<{ seriesName: string; value: unknown; color: string; seriesIndex: number; axisValue?: unknown; data?: unknown }>;
        if (!arr.length) return "";
        const x = Array.isArray(arr[0].value) ? (arr[0].value as XValue[])[0] : arr[0].axisValue;
        const lines = arr
          .filter((p) => p.seriesName && !p.seriesName.startsWith("__"))
          .map((p) => {
            const s = spec.series.find((q) => q.name === p.seriesName);
            const unit = s?.yAxis === 1 ? (spec.unit2 ?? spec.unit) : spec.unit;
            return `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p.color};margin-right:4px"></span>${p.seriesName}: <b>${fmtY(p.value, decimals, unit)}</b>`;
          });
        return `${fmtX(x as XValue, spec.kind, spec.xType)}<br/>${lines.join("<br/>")}`;
      },
    },
    legend: spec.compact ? { top: 0, right: 0, type: "scroll", data: legendNames(spec), itemHeight: 8, textStyle: { fontSize: 11 } } : { bottom: isTime ? 22 : 0, type: "scroll", data: legendNames(spec) },
    xAxis: {
      type: isTime ? "time" : isAge ? "value" : "category",
      name: spec.xLabel,
      nameLocation: "middle",
      nameGap: 24,
      min: isAge ? "dataMin" : undefined,
      max: isAge ? "dataMax" : undefined,
      data: !isTime && !isAge ? spec.categories : undefined,
      axisLabel: isTime
        ? {
            formatter: (v: number) => {
              const d = new Date(v);
              return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
            },
            hideOverlap: true,
          }
        : undefined,
    },
    yAxis: [
      { type: "value", name: spec.compact ? undefined : (spec.yLabel ?? spec.unit), splitNumber: spec.compact ? 3 : undefined, scale: true, min: spec.yMin, max: spec.yMax, axisLabel: { formatter: (v: number) => nf(decimals > 2 ? 2 : decimals).format(v) } },
      ...(hasRight ? [{ type: "value" as const, name: spec.unit2, scale: true, splitLine: { show: false }, axisLabel: { formatter: (v: number) => nf(decimals > 2 ? 2 : decimals).format(v) } }] : []),
    ],
    dataZoom: isTime ? (spec.compact ? [{ type: "inside" }] : [{ type: "inside" }, { type: "slider", height: 14, bottom: 4 }]) : undefined,
    series,
  } as EChartsOption;
}

function legendNames(spec: ChartSpec) {
  const names = [...(spec.bands ?? []).map((b) => b.name), ...spec.series.map((s) => s.name)];
  if (spec.alerts?.length) names.push("Alertas");
  return Array.from(new Set(names));
}

function refMarkLine(spec: ChartSpec, horizontal: boolean) {
  if (!spec.refLines?.length) return undefined;
  return {
    symbol: ["none", "none"],
    silent: true,
    data: spec.refLines.map((r) => ({
      ...(r.y != null ? (horizontal ? { xAxis: r.y } : { yAxis: r.y }) : { xAxis: r.x }),
      name: r.name,
      lineStyle: { color: r.color ?? "#16a34a", type: r.dashed ? "dashed" : "solid", width: 1 },
      label: { formatter: "{b}", fontSize: 10, position: "insideEndTop", color: r.color ?? "#16a34a" },
    })),
  };
}

function hexA(hex: string, a: number) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
