import { notFound } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { ReportPageView } from "@/components/reports/report-page";
import { ReportToolbar, RewriteWithAI } from "@/components/reports/report-actions";
import { getScope } from "@/server/services/context";
import { getRefDate } from "@/server/repositories/reference";
import { reportForViewer } from "@/server/services/reports/runs";
import { isISODate, lastCompleteWeekStart, weekStart } from "@/lib/dates";
import { fmtDateTime } from "@/lib/format";

export const maxDuration = 60;

export async function generateMetadata({ params }: { params: Promise<{ tipo: string }> }) {
  const { tipo } = await params;
  return { title: tipo === "comparativo" ? "Relatório Comparativo" : "Relatório Semanal" };
}

export default async function ReportPage({ params }: { params: Promise<{ tipo: string; semana: string }> }) {
  const { tipo, semana } = await params;
  if (tipo !== "semanal" && tipo !== "comparativo") notFound();
  if (!isISODate(semana)) notFound();
  const ws = weekStart(semana);
  const [scope, ref] = await Promise.all([getScope(), getRefDate()]);
  if (ws > lastCompleteWeekStart(ref)) notFound();
  const { model, info, live } = await reportForViewer(tipo, scope, ws);
  return (
    <div className="space-y-4">
      <PageHeader
        title={`${model.title} — ${model.weekLabel.replace("Semana de ", "semana de ")}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {info ? `Retrato arquivado em ${fmtDateTime(info.generatedAt)}` : live ? "Versão montada agora com os dados atuais" : null}
            {info?.dataChangedAfter && (
              <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">
                <AlertTriangle className="size-3" /> dados corrigidos após a geração (o retrato não foi reescrito)
              </span>
            )}
            {model.scopeNote && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{model.scopeNote}</span>}
          </span>
        }
        actions={<ReportToolbar model={model} kind={tipo} week={ws} canGenerate={scope.canConfigure} />}
      />
      {process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_MODEL ? <RewriteWithAI tipo={tipo} week={ws} /> : null}
      <div className="space-y-4">
        {model.pages.map((p) => (
          <ReportPageView key={p.n} page={p} model={model} />
        ))}
      </div>
    </div>
  );
}
