import { BarChart } from "@/components/charts";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { fmtBRL, fmtDate, fmtInt, fmtNumber } from "@/lib/format";
import type { getCulling } from "@/server/services/finance";

export function CullingView({ c }: { c: NonNullable<Awaited<ReturnType<typeof getCulling>>> }) {
  return (
    <div className="space-y-3">
      <div className="rounded-lg border-l-4 border-primary bg-slate-50 p-3 text-sm">
        <b>{c.flock}</b> ({c.house}, {c.strain}, {c.ageWeek} semanas). Premissas: postura pela curva da linhagem {c.adjustment >= 0 ? "+" : "−"}
        {fmtNumber(Math.abs(c.adjustment), 1)} p.p. (ajuste do lote), mortalidade padrão, ovo a {fmtBRL(c.egg)}/dz e ração a {fmtBRL(c.feed)}/kg (preços atuais). Descarte planejado em {fmtDate(c.plannedCull)}.
        <div className="mt-2 text-base">
          {c.recommendedWeek && c.basis === "margem" ? (
            <span>
              Semana recomendada de descarte: <b>semana {c.recommendedWeek}</b> (a partir de {fmtDate(c.recommendedDate)}), a primeira com margem de contribuição negativa por 2 semanas seguidas.
            </span>
          ) : c.recommendedWeek && c.basis === "planejado" ? (
            <span>
              Semana recomendada de descarte: <b>semana {c.recommendedWeek}</b> — o descarte planejado ({fmtDate(c.recommendedDate)}). A margem de contribuição projetada continua positiva até lá; a margem total é negativa por causa da amortização da franga e da depreciação, que já foram gastas e não mudam com a decisão. Antecipar o descarte não melhora o resultado.
            </span>
          ) : (
            <span>A margem de contribuição projetada não fica negativa por 2 semanas seguidas nas próximas 16 semanas.</span>
          )}
        </div>
      </div>
      <BarChart
        spec={{
          kind: "bar",
          title: "Margem de contribuição semanal projetada (Estimado)",
          unit: "R$",
          decimals: 0,
          categories: c.weeks.map((w) => `S${w.week}`),
          series: [{ name: "Margem de contribuição", type: "bar", data: c.weeks.map((w) => [`S${w.week}`, w.contribution]), colors: c.weeks.map((w) => (w.contribution < 0 ? "#dc2626" : "#16a34a")) }],
          refLines: [{ name: "zero", y: 0, color: "#111827" }],
        }}
        height={280}
      />
      <p className="text-xs text-muted-foreground">
        A amortização da franga e a depreciação não entram: já foram gastas e não mudam com a decisão. A comparação com alojar o próximo lote mais cedo fica fora da beta.
      </p>
      <Table>
        <THead>
          <TR>
            <TH>Semana</TH>
            <TH>Início</TH>
            <TH className="text-right">Idade</TH>
            <TH className="text-right">Postura</TH>
            <TH className="text-right">Aves</TH>
            <TH className="text-right">Ovos</TH>
            <TH className="text-right">Receita</TH>
            <TH className="text-right">Custos evitáveis</TH>
            <TH className="text-right">Contribuição</TH>
          </TR>
        </THead>
        <TBody>
          {c.weeks.map((w) => (
            <TR key={w.week} className={c.recommendedWeek === w.week ? "bg-amber-50 font-medium" : ""}>
              <TD>S{w.week}</TD>
              <TD>{fmtDate(w.weekStart)}</TD>
              <TD className="text-right">{w.ageWeek}</TD>
              <TD className="text-right tabular-nums">{fmtNumber(w.posture, 1)}%</TD>
              <TD className="text-right tabular-nums">{fmtInt(Math.round(w.birds))}</TD>
              <TD className="text-right tabular-nums">{fmtInt(Math.round(w.eggs))}</TD>
              <TD className="text-right tabular-nums">{fmtBRL(w.revenue, 0)}</TD>
              <TD className="text-right tabular-nums">{fmtBRL(w.avoidableCost, 0)}</TD>
              <TD className={`text-right tabular-nums ${w.contribution < 0 ? "text-red-700" : ""}`}>{fmtBRL(w.contribution, 0)}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}
