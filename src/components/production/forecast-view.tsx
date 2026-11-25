import { ForecastChart } from "@/components/charts";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { CsvButton } from "@/components/production/csv-button";
import { HOUSE_COLORS } from "@/lib/colors";
import { fmtDate, fmtInt, fmtNumber } from "@/lib/format";
import type { getForecast } from "@/server/services/finance";

type F = Awaited<ReturnType<typeof getForecast>>;

export function ForecastView({ f, house }: { f: F; house?: string }) {
  const rows = house ? f.houses.filter((h) => h.house === house) : f.houses;
  const total = house
    ? rows.map((r) => ({ weekStart: r.weekStart, week: r.week, eggs: r.eggs, boxes: r.boxes, boxesLow: r.eggsLow / 360, boxesHigh: r.eggsHigh / 360 }))
    : f.farm;
  const houses = Array.from(new Set(rows.map((r) => r.house)));
  const csv = [["Semana", "Início", "Galpão", "Postura prevista (%)", "Aves", "Ovos", "Caixas", "Caixas (mín.)", "Caixas (máx.)"], ...rows.map((r) => [r.week, r.weekStart, r.house, Number(r.posture.toFixed(1)), Math.round(r.birds), Math.round(r.eggs), Math.round(r.boxes), Math.round(r.eggsLow / 360), Math.round(r.eggsHigh / 360)])];
  return (
    <div className="space-y-3">
      <ForecastChart
        spec={{
          kind: "forecast",
          title: house ? `Previsão do ${house} (caixas por semana)` : "Previsão da granja (caixas por semana)",
          unit: "cx",
          decimals: 0,
          xType: "category",
          categories: total.map((t) => `S${t.week} · ${t.weekStart.slice(8, 10)}/${t.weekStart.slice(5, 7)}`),
          series: [
            ...(house ? [] : houses.map((h) => ({ name: h, type: "bar" as const, stack: "h", color: HOUSE_COLORS[h], data: rows.filter((r) => r.house === h).map((r) => [`S${r.week} · ${r.weekStart.slice(8, 10)}/${r.weekStart.slice(5, 7)}`, r.boxes] as [string, number]) }))),
            { name: "Total previsto", color: "#111827", width: 2.5, data: total.map((t) => [`S${t.week} · ${t.weekStart.slice(8, 10)}/${t.weekStart.slice(5, 7)}`, t.boxes] as [string, number]) },
            { name: "Faixa mínima", color: "#9ca3af", dashed: true, data: total.map((t) => [`S${t.week} · ${t.weekStart.slice(8, 10)}/${t.weekStart.slice(5, 7)}`, t.boxesLow] as [string, number]) },
            { name: "Faixa máxima", color: "#9ca3af", dashed: true, data: total.map((t) => [`S${t.week} · ${t.weekStart.slice(8, 10)}/${t.weekStart.slice(5, 7)}`, t.boxesHigh] as [string, number]) },
          ],
        }}
        height={300}
      />
      <div className="flex justify-end">
        <CsvButton name={house ? `previsao-${house}` : "previsao-granja-comercial"} rows={csv} label="Baixar CSV para o comercial" />
      </div>
      <Table>
        <THead>
          <TR>
            <TH>Semana</TH>
            <TH>Início</TH>
            <TH className="text-right">Ovos</TH>
            <TH className="text-right">Caixas</TH>
            <TH className="text-right">Faixa (caixas)</TH>
          </TR>
        </THead>
        <TBody>
          {total.map((t) => (
            <TR key={t.weekStart}>
              <TD>S{t.week}</TD>
              <TD>{fmtDate(t.weekStart)}</TD>
              <TD className="text-right tabular-nums">{fmtInt(Math.round(t.eggs))}</TD>
              <TD className="text-right font-medium tabular-nums">{fmtInt(Math.round(t.boxes))}</TD>
              <TD className="text-right tabular-nums text-muted-foreground">
                {fmtInt(Math.round(t.boxesLow))} – {fmtInt(Math.round(t.boxesHigh))}
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
      <p className="text-xs text-muted-foreground">Postura = curva da linhagem + ajuste do lote; aves = atuais menos a mortalidade padrão; faixa de ± (1,0 + 0,3 × semana) p.p. Lotes que chegam ao descarte planejado zeram. {fmtNumber(0, 0) && ""}</p>
    </div>
  );
}
