import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, CircleHelp, Siren, Sun } from "lucide-react";
import { getScope } from "@/server/services/context";
import { getHomeData } from "@/server/services/home";
import { getDataHealth, getHeatWarning, getOpenAlerts, getPendingQuestions } from "@/server/services/home-extra";
import { getHomeBriefing, getHomeForecast, getHomeRanking } from "@/server/services/home-insights";
import { KpiCard } from "@/components/kpi/kpi-card";
import { HouseHeatmap } from "@/components/kpi/house-heatmap";
import { PageHeader, Section, EmptyState } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { SEVERITY_LABEL } from "@/engine/impacts/event-types";
import { fmtDate, fmtDayMonth, fmtInt, fmtNumber, fmtPct, fmtSince } from "@/lib/format";
import { houseColor } from "@/lib/colors";
import { QuestionCard } from "@/components/alerts/question-card";

export const metadata: Metadata = { title: "Início" };

const SEV_VARIANT: Record<string, "bad" | "warn" | "info" | "purple"> = { critica: "bad", alta: "bad", media: "warn", baixa: "info", aviso: "purple" };

export default async function HomePage() {
  const scope = await getScope();
  const [home, alerts, heat, questions, health, briefing, ranking, forecast] = await Promise.all([
    getHomeData(scope),
    getOpenAlerts(scope),
    getHeatWarning(),
    scope.user.role === "encarregado" ? getPendingQuestions(scope) : Promise.resolve([]),
    getDataHealth(scope),
    getHomeBriefing(scope),
    getHomeRanking(scope),
    getHomeForecast(scope),
  ]);
  const escalated = alerts.filter((a) => a.escalated);

  return (
    <div className="space-y-4">
      <PageHeader title="Início" description={`Visão executiva da granja · dados até ${fmtDate(home.refDate)}`} />

      {escalated.length > 0 && (
        <div className="rounded-xl border-2 border-red-500 bg-red-50 p-3">
          <div className="flex items-center gap-2 font-semibold text-red-800">
            <Siren className="size-5" /> Alertas sem reconhecimento há muito tempo
          </div>
          <ul className="mt-1 space-y-1 text-sm">
            {escalated.map((a) => (
              <li key={a.id}>
                <Link href={`/alertas/${a.id}`} className="text-red-900 underline">
                  {a.title}
                </Link>{" "}
                <span className="text-red-700">· aberto {fmtSince(a.openedAt)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {heat && (
        <div className="flex flex-wrap items-start gap-3 rounded-xl border border-violet-300 bg-violet-50 p-3">
          <Sun className="mt-0.5 size-5 text-violet-700" />
          <div className="flex-1 text-sm">
            <div className="font-semibold text-violet-900">Aviso preventivo: {heat.title}</div>
            <div className="text-violet-800">
              {(heat.observed.days ?? []).map((d) => `${fmtDayMonth(d.date)}: ${fmtNumber(d.tempMax, 1)} °C`).join(" · ")}
              {heat.observed.houses?.length ? ` — maior risco: ${heat.observed.houses.map((h) => `${h.code} (Δ ${fmtNumber(h.coolingDelta, 1)} °C)`).join(", ")}` : ""}
            </div>
          </div>
          <Link href={`/alertas/${heat.id}`} className="text-sm text-violet-900 underline">
            ver aviso
          </Link>
        </div>
      )}

      {questions.length > 0 && (
        <Section title="Pergunta pendente da plataforma" description="Sua resposta ajuda a entender a causa da anomalia.">
          <div className="grid gap-3 md:grid-cols-2">
            {questions.map((q) => (
              <QuestionCard key={q.id} q={q} />
            ))}
          </div>
        </Section>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {home.cards.map((c) => (
          <KpiCard key={c.key} c={c} />
        ))}
      </div>

      <Section title="Galpões × indicadores" description="Últimos 7 dias, cores pelas metas. Clique numa célula para abrir a ficha do galpão na aba certa.">
        <HouseHeatmap rows={home.heat} columns={home.columns} />
      </Section>

      <div className="grid gap-4 xl:grid-cols-3">
        <Section title="Alertas abertos" className="xl:col-span-2" actions={<Link href="/alertas" className="text-sm text-primary hover:underline">central de alertas</Link>}>
          {alerts.length === 0 ? (
            <EmptyState title="Nenhum alerta aberto">Quando algo sair do normal, o alerta aparece aqui com a hipótese principal.</EmptyState>
          ) : (
            <ul className="divide-y">
              {alerts.map((a) => (
                <li key={a.id} className={`flex flex-wrap items-center gap-2 py-2 ${a.escalated ? "bg-red-50" : ""}`}>
                  <Badge variant={SEV_VARIANT[a.severity] ?? "secondary"}>{SEVERITY_LABEL[a.severity] ?? a.severity}</Badge>
                  <Link href={`/alertas/${a.id}`} className="min-w-0 flex-1 truncate font-medium hover:underline">
                    {a.title}
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    {a.ruleCode} · aberto {fmtSince(a.openedAt)}
                    {a.status === "em_investigacao" ? " · em investigação" : a.status === "reconhecido" ? " · reconhecido" : ""}
                  </span>
                  {a.topHypothesis && (
                    <span className="w-full text-xs text-muted-foreground md:w-auto">
                      Hipótese: {a.topHypothesis.name} ({a.topHypothesis.confidence})
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Briefing do dia" description="Gerado automaticamente a partir dos números.">
          {briefing.lines.length === 0 ? (
            <EmptyState title="Sem briefing" />
          ) : (
            <ul className="list-disc space-y-1.5 pl-4 text-sm">
              {briefing.lines.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Section title="Melhores e piores galpões" description={ranking.weekLabel ? `Nota composta · ${ranking.weekLabel}` : "Nota composta"}>
          {ranking.items.length === 0 ? (
            <EmptyState title="Ranking indisponível">É calculado com a última semana completa (lotes com 26 semanas ou mais).</EmptyState>
          ) : (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="mb-1 text-xs font-medium text-green-700">Melhores</div>
                {ranking.items.slice(0, 3).map((r) => (
                  <RankLine key={r.house} r={r} />
                ))}
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-red-700">Piores</div>
                {ranking.items.slice(-3).reverse().map((r) => (
                  <RankLine key={r.house} r={r} />
                ))}
              </div>
            </div>
          )}
        </Section>
        <Section title="Previsão de 4 semanas" description="Produção da granja em caixas (curva da linhagem + ajuste do lote).">
          {forecast.weeks.length === 0 ? (
            <EmptyState title="Previsão indisponível" />
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {forecast.weeks.map((w) => (
                  <tr key={w.weekStart} className="border-b last:border-0">
                    <td className="py-1.5 text-muted-foreground">{w.label}</td>
                    <td className="py-1.5 text-right font-medium tabular-nums">{fmtInt(w.boxes)} cx</td>
                    <td className="py-1.5 text-right text-xs text-muted-foreground">
                      {fmtInt(w.boxesLow)}–{fmtInt(w.boxesHigh)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
        <Section title="Saúde dos dados" description="Completude por fonte (últimos 7 dias).">
          <ul className="space-y-1 text-sm">
            {health.sources.map((s) => (
              <li key={s.source} className="flex justify-between">
                <span>{s.source}</span>
                <span className="tabular-nums">{fmtPct(s.pct, 1)}</span>
              </li>
            ))}
          </ul>
          {health.problems.length > 0 ? (
            <div className="mt-2 rounded-md bg-red-50 p-2 text-xs text-red-800">
              <AlertTriangle className="mr-1 inline size-3" />
              Contadores sem comunicação: {health.problems.map((p) => `${p.code} (${p.house})`).join(", ")}
            </div>
          ) : (
            <div className="mt-2 text-xs text-muted-foreground">{health.devices} dispositivos sem problemas.</div>
          )}
          <Link href="/dispositivos" className="mt-2 inline-block text-xs text-primary hover:underline">
            ver dispositivos
          </Link>
        </Section>
      </div>
      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        <CircleHelp className="size-3" /> Percentuais da granja são sempre a soma dos numeradores dividida pela soma dos denominadores.
      </p>
    </div>
  );
}

function RankLine({ r }: { r: { house: string; position: number; score: number; phase: string } }) {
  return (
    <Link href={`/galpoes/${r.house}`} className="flex items-center justify-between gap-2 rounded px-1 py-1 hover:bg-muted">
      <span className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground">{r.position}º</span>
        <span className="size-2 rounded-full" style={{ background: houseColor(r.house) }} />
        <span className="font-medium">{r.house}</span>
      </span>
      <span className="tabular-nums">{fmtNumber(r.score, 0)}</span>
    </Link>
  );
}
