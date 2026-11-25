import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getScope } from "@/server/services/context";
import { getScenarios, scenarioDetection } from "@/server/services/scenarios";
import { readDaily } from "@/server/services/metrics-query";
import { getRefDate } from "@/server/repositories/reference";
import { addDays } from "@/lib/dates";
import { HOUSE_COLORS } from "@/lib/colors";
import { SyncedPanel } from "@/components/charts";
import { PageHeader, Section } from "@/components/layout/page-header";
import { ParamSelect } from "@/components/layout/defect-select";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { fmtDate } from "@/lib/format";
import type { ChartSpec, EventMark } from "@/components/charts/types";
import type { SearchParams } from "@/lib/filters";

export const metadata: Metadata = { title: "Conferência do simulador" };

const METRICS: Array<[string, string, string]> = [
  ["prod.postura", "Postura", "%"],
  ["nut.racao", "Ração", "g/ave/dia"],
  ["nut.agua", "Água", "mL/ave/dia"],
  ["amb.temp_max", "Temperatura interna máx.", "°C"],
  ["qual.trincados_pista1", "Trincados pista 1", "%"],
  ["qual.trincados_pista2", "Trincados pista 2", "%"],
  ["qual.sujos_fezes", "Sujos de fezes", "%"],
  ["qual.sujos_sangue", "Sujos de sangue", "%"],
  ["mort.mortes", "Mortes", "aves"],
  ["lab.resistencia", "Resistência da casca (lab.)", "kgf"],
];

export default async function ValidacaoPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const scope = await getScope();
  if (!scope.canDemo) redirect("/");
  const sp = await searchParams;
  const house = typeof sp.galpao === "string" ? sp.galpao.toUpperCase() : "P005";
  const janela = typeof sp.janela === "string" ? sp.janela : "recente";
  const refDate = await getRefDate();
  const [scenarios, detection] = await Promise.all([getScenarios(), scenarioDetection()]);
  const from = janela === "historico" ? addDays(refDate, -1095) : addDays(refDate, -90);
  const rows = await readDaily(scope, { houses: [house], metrics: METRICS.map((m) => m[0]), from, to: refDate });
  const marks: EventMark[] = scenarios.filter((s) => s.houses.includes(house) && s.end >= from).map((s) => ({ id: "", label: s.code, category: s.code.startsWith("H") ? "manejo" : "detectado", from: s.start, to: s.end === s.start ? addDays(s.end, 1) : s.end }));
  const specs: ChartSpec[] = METRICS.map(([m, name, unit]) => ({
    kind: "timeseries",
    title: name,
    unit,
    decimals: unit === "%" ? 2 : 1,
    series: [{ name, data: rows.filter((r) => r.metric === m).map((r) => [r.date, r.value]), color: HOUSE_COLORS[house], width: 1.2, type: m === "mort.mortes" ? "bar" : "line" }],
    events: marks,
  }));
  return (
    <div className="space-y-4">
      <PageHeader
        title="Conferência do simulador"
        description="Séries brutas por galpão com as datas dos cenários S1–S9 e H1–H6 sombreadas, e a tabela cenário → detectado."
        actions={
          <>
            <ParamSelect name="galpao" value={house} label="Galpão" options={["P001", "P002", "P003", "P004", "P005", "P006", "P007", "P008"].map((h) => ({ key: h, label: h }))} />
            <ParamSelect name="janela" value={janela} label="Janela" options={[{ key: "recente", label: "Últimos 90 dias" }, { key: "historico", label: "3 anos" }]} />
          </>
        }
      />
      <Section title="Cenário → detectado?">
        <Table>
          <THead>
            <TR>
              <TH>Cenário</TH>
              <TH>Galpões</TH>
              <TH>Período</TH>
              <TH>Regras esperadas</TH>
              <TH>Alertas encontrados</TH>
              <TH>Resultado</TH>
            </TR>
          </THead>
          <TBody>
            {detection.map((d) => (
              <TR key={d.code}>
                <TD className="font-medium">
                  {d.code} — {d.name}
                </TD>
                <TD className="max-w-48 truncate">{d.houses.join(", ")}</TD>
                <TD>
                  {fmtDate(d.start)} a {fmtDate(d.end)}
                </TD>
                <TD className="font-mono text-xs">{d.expected.join(", ") || "nenhuma"}</TD>
                <TD className="max-w-80 text-xs whitespace-normal">
                  {d.found.slice(0, 8).map((f) => (
                    <Link key={f.id} href={`/alertas/${f.id}`} className="mr-2 text-primary hover:underline">
                      {f.rule} {f.house ?? "granja"} ({fmtDate(f.openedOn).slice(0, 5)})
                    </Link>
                  ))}
                  {d.found.length > 8 && `+${d.found.length - 8}`}
                </TD>
                <TD>
                  <Badge variant={d.detected ? "ok" : "bad"}>{d.label}</Badge>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Section>
      <Section title={`Séries brutas — ${house}`} description="Faixas: cenários recentes (roxo) e casos históricos (azul).">
        <SyncedPanel specs={specs} height={150} />
      </Section>
    </div>
  );
}
