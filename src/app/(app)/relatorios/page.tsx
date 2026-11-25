import Link from "next/link";
import { AlertTriangle, FileText } from "lucide-react";
import { PageHeader, Section } from "@/components/layout/page-header";
import { GenerateButton } from "@/components/reports/report-actions";
import { getScope } from "@/server/services/context";
import { getRefDate } from "@/server/repositories/reference";
import { listRuns } from "@/server/services/reports/runs";
import { lastCompleteWeekStart, weekLabel } from "@/lib/dates";
import { fmtDateTime } from "@/lib/format";

export const metadata = { title: "Relatórios" };

export default async function RelatoriosPage() {
  const [scope, ref, runs] = await Promise.all([getScope(), getRefDate(), listRuns()]);
  const last = lastCompleteWeekStart(ref);
  const weeks = Array.from(new Set([last, ...runs.map((r) => r.weekStart)])).sort().reverse();
  return (
    <div className="space-y-4">
      <PageHeader
        title="Relatórios"
        description="Relatório Semanal (11 páginas) e Relatório Comparativo (9 páginas), gerados e arquivados a cada semana. Abra para ver na tela, imprimir em A4 paisagem, baixar PDF ou apresentar no modo reunião."
        actions={scope.canConfigure ? <GenerateButton label={`Gerar agora (${weekLabel(last).replace("Semana de ", "")})`} /> : null}
      />
      <Section title="Semanas" description="O arquivo guarda o retrato dos números de quando o relatório foi gerado. Se os dados mudarem depois, aparece o aviso “dados corrigidos após a geração”.">
        <div className="divide-y">
          {weeks.map((w) => {
            const ofWeek = runs.filter((r) => r.weekStart === w);
            return (
              <div key={w} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-56 font-medium">{weekLabel(w)}</div>
                {(["semanal", "comparativo"] as const).map((k) => {
                  const r = ofWeek.find((x) => x.kind === k);
                  return (
                    <Link key={k} href={`/relatorios/${k}/${w}`} className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm hover:border-emerald-400">
                      <FileText className="size-4 text-emerald-700" />
                      <span>
                        <span className="font-medium">{k === "semanal" ? "Relatório Semanal" : "Relatório Comparativo"}</span>
                        <span className="block text-[11px] text-slate-500">{r ? `gerado em ${fmtDateTime(r.generatedAt)}` : "ainda não arquivado (abre a versão atual)"}</span>
                      </span>
                      {r?.dataChangedAfter && (
                        <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-800">
                          <AlertTriangle className="size-3" /> dados corrigidos após a geração
                        </span>
                      )}
                    </Link>
                  );
                })}
                {w === last && (
                  <Link href={`/reuniao/${w}`} className="text-sm text-emerald-700 underline">
                    Modo reunião
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      </Section>
    </div>
  );
}
