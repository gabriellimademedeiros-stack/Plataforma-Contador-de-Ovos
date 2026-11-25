import { notFound } from "next/navigation";
import { ReportPageView } from "@/components/reports/report-page";
import { PrintControls } from "@/components/reports/print-controls";
import type { RBlock } from "@/components/reports/types";
import { getScope } from "@/server/services/context";
import { getRefDate } from "@/server/repositories/reference";
import { reportForViewer } from "@/server/services/reports/runs";
import { isISODate, lastCompleteWeekStart, weekStart } from "@/lib/dates";

export const maxDuration = 60;
export const metadata = { title: "Imprimir relatório" };

const countCharts = (bs: RBlock[]): number => bs.reduce((a, b) => a + (b.type === "chart" ? 1 : b.type === "grid" ? countCharts(b.blocks) : 0), 0);

export default async function PrintReport({ params, searchParams }: { params: Promise<{ tipo: string; semana: string }>; searchParams: Promise<{ auto?: string }> }) {
  const { tipo, semana } = await params;
  const { auto } = await searchParams;
  if ((tipo !== "semanal" && tipo !== "comparativo") || !isISODate(semana)) notFound();
  const ws = weekStart(semana);
  const [scope, ref] = await Promise.all([getScope(), getRefDate()]);
  if (ws > lastCompleteWeekStart(ref)) notFound();
  const { model } = await reportForViewer(tipo, scope, ws);
  const charts = model.pages.reduce((a, p) => a + countCharts(p.blocks), 0);
  return (
    <div className="print-report">
      <style>{"@page { size: A4 landscape; margin: 12mm; }"}</style>
      <PrintControls charts={charts} back={`/relatorios/${tipo}/${ws}`} auto={auto === "1"} />
      <div className="flex flex-col items-center gap-6 py-6 print:block print:gap-0 print:py-0">
        {model.pages.map((p) => (
          <div key={p.n} className="sheet bg-white p-[12mm] shadow-lg print:p-0 print:shadow-none">
            <ReportPageView page={p} model={model} variant="print" />
          </div>
        ))}
      </div>
    </div>
  );
}
