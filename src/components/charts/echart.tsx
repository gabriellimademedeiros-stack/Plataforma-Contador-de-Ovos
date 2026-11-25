"use client";
/**
 * Base dos gráficos (Parte 14.2): ECharts com renderizador SVG (bom para impressão), dicas em pt-BR com unidade,
 * legenda clicável, botões "baixar imagem", "baixar CSV" e "Perguntar à IA".
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ReactEChartsCore from "echarts-for-react/lib/core";
import * as echarts from "echarts/core";
import { BarChart, CustomChart, HeatmapChart, LineChart, ScatterChart } from "echarts/charts";
import {
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  MarkPointComponent,
  TitleComponent,
  TooltipComponent,
  VisualMapComponent,
} from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import { Bot, Download, ImageDown } from "lucide-react";
import type { ChartSpec } from "./types";
import { buildOption } from "./build-option";
import { specToCsv } from "./csv";

echarts.use([
  LineChart,
  BarChart,
  ScatterChart,
  HeatmapChart,
  CustomChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  MarkPointComponent,
  TitleComponent,
  DataZoomComponent,
  VisualMapComponent,
  SVGRenderer,
]);

export { echarts };

export function askAI(question: string, context: Record<string, unknown> = {}) {
  window.dispatchEvent(new CustomEvent("ovos:ask", { detail: { question, context } }));
}

function download(name: string, href: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function EChart({
  spec,
  group,
  height,
  hideToolbar,
  onRendered,
}: {
  spec: ChartSpec;
  group?: string;
  height?: number;
  hideToolbar?: boolean;
  onRendered?: () => void;
}) {
  const ref = useRef<ReactEChartsCore>(null);
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const option = useMemo(() => buildOption(spec), [spec]);
  const h = height ?? spec.height ?? 300;

  useEffect(() => {
    const inst = ref.current?.getEchartsInstance();
    if (!inst) return;
    if (group) {
      inst.group = group;
      echarts.connect(group);
    }
    const onFinished = () => {
      if (!ready) {
        setReady(true);
        onRendered?.();
        window.dispatchEvent(new CustomEvent("ovos:chart-rendered"));
      }
    };
    inst.on("finished", onFinished);
    return () => {
      inst.off("finished", onFinished);
    };
  }, [group, ready, onRendered]);

  const onEvents = useMemo(
    () => ({
      click: (p: { data?: { eventId?: string; alertId?: string; href?: string }; componentType?: string }) => {
        const d = p?.data;
        if (d?.eventId) router.push(`/eventos/${d.eventId}`);
        else if (d?.alertId) router.push(`/alertas/${d.alertId}`);
        else if (d?.href) router.push(d.href);
      },
    }),
    [router],
  );

  const name = (spec.title ?? "grafico").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/gi, "-").toLowerCase();

  return (
    <div className="chart-block break-inside-avoid">
      {(spec.title || !hideToolbar) && (
        <div className="mb-1 flex flex-wrap items-start justify-between gap-2">
          <div>
            {spec.title && <div className="text-sm font-semibold">{spec.title}</div>}
            {spec.subtitle && <div className="text-xs text-muted-foreground">{spec.subtitle}</div>}
          </div>
          {!hideToolbar && (
            <div className="no-print flex items-center gap-1">
              <button
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                title="Baixar imagem"
                onClick={() => {
                  const inst = ref.current?.getEchartsInstance();
                  if (inst) download(`${name}.svg`, inst.getDataURL({ type: "svg", backgroundColor: "#fff" }));
                }}
              >
                <ImageDown className="size-4" />
              </button>
              <button
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                title="Baixar CSV"
                onClick={() => {
                  const blob = new Blob(["﻿" + specToCsv(spec)], { type: "text/csv;charset=utf-8" });
                  const url = URL.createObjectURL(blob);
                  download(`${name}.csv`, url);
                  setTimeout(() => URL.revokeObjectURL(url), 2000);
                }}
              >
                <Download className="size-4" />
              </button>
              <button
                className="flex items-center gap-1 rounded px-1.5 py-1 text-xs text-primary hover:bg-muted"
                title="Perguntar à IA sobre este gráfico"
                onClick={() => askAI("Explique este gráfico", { grafico: spec.title, ...spec.context })}
              >
                <Bot className="size-4" /> Perguntar à IA
              </button>
            </div>
          )}
        </div>
      )}
      {spec.warnings?.map((w) => (
        <div key={w} className="mb-1 rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">
          {w}
        </div>
      ))}
      <ReactEChartsCore
        ref={ref}
        echarts={echarts}
        option={option}
        notMerge
        lazyUpdate
        opts={{ renderer: "svg" }}
        style={{ height: h, width: "100%" }}
        onEvents={onEvents}
      />
      {spec.source && <div className="mt-1 text-[11px] text-muted-foreground">Fonte: {spec.source}</div>}
    </div>
  );
}
