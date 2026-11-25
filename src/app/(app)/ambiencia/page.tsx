import type { Metadata } from "next";
import { Sun } from "lucide-react";
import { getScope } from "@/server/services/context";
import { getAmbiencePage } from "@/server/services/thematic";
import { getRefDate } from "@/server/repositories/reference";
import { resolveFilters, type SearchParams } from "@/lib/filters";
import { Heatmap, RankingBars, TimeSeriesChart } from "@/components/charts";
import { PageHeader, Section } from "@/components/layout/page-header";
import { fmtDate, fmtDayMonth, fmtNumber } from "@/lib/format";

export const metadata: Metadata = { title: "Ambiência" };

export default async function AmbienciaPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const scope = await getScope();
  const f = resolveFilters(await searchParams, await getRefDate());
  const d = await getAmbiencePage(scope, f.days);
  const hot = d.forecast.filter((x) => x.hot);
  return (
    <div className="space-y-4">
      <PageHeader title="Ambiência" description={`${fmtDate(d.from)} a ${fmtDate(d.to)}`} />
      <Section title="Previsão de 7 dias">
        {hot.length > 0 && (
          <div className="mb-3 flex items-center gap-2 rounded-md border border-violet-300 bg-violet-50 p-2 text-sm text-violet-900">
            <Sun className="size-4" /> Aviso de calor: máxima prevista de {hot.map((h) => `${fmtNumber(h.tmax, 1)} °C em ${fmtDayMonth(h.date)}`).join(" e ")}. Maior risco (menor Δ de resfriamento):{" "}
            {d.risk.map((r) => `${r.code} (${fmtNumber(r.delta, 1)} °C)`).join(", ")}.
          </div>
        )}
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-7">
          {d.forecast.map((x) => (
            <div key={x.date} className={`rounded-lg border p-2 text-center ${x.hot ? "border-red-300 bg-red-50" : ""}`}>
              <div className="text-xs text-muted-foreground">{fmtDayMonth(x.date)}</div>
              <div className={`text-lg font-semibold ${x.hot ? "text-red-700" : ""}`}>{fmtNumber(x.tmax, 1)}°</div>
              <div className="text-xs text-muted-foreground">mín. {fmtNumber(x.tmin, 1)}°</div>
            </div>
          ))}
        </div>
      </Section>
      <Section title="Temperatura máxima">
        <TimeSeriesChart spec={d.temps} height={320} />
      </Section>
      <Section title="Horas acima de 32 °C">
        <Heatmap spec={d.heat} />
      </Section>
      <div className="grid gap-4 xl:grid-cols-2">
        <Section title="Ranking de resfriamento">
          <RankingBars spec={d.cooling} />
        </Section>
        <Section title="Amônia">
          <TimeSeriesChart spec={d.nh3} />
        </Section>
      </div>
    </div>
  );
}
