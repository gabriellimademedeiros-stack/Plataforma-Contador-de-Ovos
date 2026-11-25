import type { Metadata } from "next";
import Link from "next/link";
import { getScope } from "@/server/services/context";
import { getAlertCenter } from "@/server/services/alert-detail";
import { getRefDate } from "@/server/repositories/reference";
import { scopedHouseCodes } from "@/server/services/metrics-query";
import { resolveFilters, type SearchParams } from "@/lib/filters";
import { PageHeader, Section, EmptyState } from "@/components/layout/page-header";
import { ParamSelect } from "@/components/layout/defect-select";
import { TabNav } from "@/components/house/tab-nav";
import { AlertTable, STATUS_ALERT_LABEL } from "@/components/alerts/alert-table";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { RULES } from "@/engine/alerts/rules";
import { fmtDate, fmtPct } from "@/lib/format";

export const metadata: Metadata = { title: "Alertas" };

export default async function AlertasPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const scope = await getScope();
  const f = resolveFilters(sp, await getRefDate(), "90d");
  const one = (k: string) => (typeof sp[k] === "string" && sp[k] !== "todos" ? (sp[k] as string) : null);
  const tab = ["abertos", "investigacao", "resolvidos", "descartados", "incidentes"].includes(String(sp.aba)) ? String(sp.aba) : "abertos";
  const d = await getAlertCenter(scope, { tab, house: one("galpao"), rule: one("regra"), severity: one("severidade"), from: f.from, to: f.to });
  const houses = await scopedHouseCodes(scope);
  const keep = new URLSearchParams(Object.entries(sp).filter(([k, v]) => k !== "aba" && typeof v === "string") as [string, string][]).toString();
  return (
    <div className="space-y-4">
      <PageHeader title="Central de alertas" description="Poucos alertas, todos com evidência e hipótese de causa." />
      <TabNav
        base="/alertas"
        active={tab}
        query={keep}
        tabs={[
          { key: "abertos", label: `Abertos (${d.counts.abertos})` },
          { key: "investigacao", label: `Em investigação (${d.counts.investigacao})` },
          { key: "resolvidos", label: `Resolvidos (${d.counts.resolvidos})` },
          { key: "descartados", label: `Descartados (${d.counts.descartados})` },
          { key: "incidentes", label: "Incidentes" },
        ]}
      />
      <div className="flex flex-wrap gap-2">
        <ParamSelect name="galpao" label="Galpão" value={one("galpao") ?? "todos"} options={[{ key: "todos", label: "Todos os galpões" }, ...houses.map((h) => ({ key: h, label: h }))]} />
        <ParamSelect name="regra" label="Regra" value={one("regra") ?? "todos"} options={[{ key: "todos", label: "Todas as regras" }, ...RULES.filter((r) => scope.canSeeFinance || r.code !== "A22").map((r) => ({ key: r.code, label: `${r.code} — ${r.name}` }))]} />
        <ParamSelect name="severidade" label="Severidade" value={one("severidade") ?? "todos"} options={[{ key: "todos", label: "Qualquer severidade" }, { key: "critica", label: "Crítica" }, { key: "alta", label: "Alta" }, { key: "media", label: "Média" }, { key: "aviso", label: "Aviso" }]} />
      </div>
      {tab === "incidentes" ? (
        <Section title="Incidentes" description="Alertas agrupados pelo mesmo problema (mesmo galpão em até 3 dias, ou a mesma regra em 3 ou mais galpões).">
          {d.incidents.length === 0 ? (
            <EmptyState title="Nenhum incidente" />
          ) : (
            <ul className="divide-y">
              {d.incidents.map((i) => (
                <li key={i.id} className="py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={i.scope === "granja" ? "purple" : "secondary"}>{i.scope === "granja" ? "Granja" : i.house}</Badge>
                    <span className="font-medium">{i.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {fmtDate(i.openedOn)} · {i.n} alertas · {i.status}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-2 text-xs">
                    {i.alerts.map((a) => (
                      <Link key={a.id} href={`/alertas/${a.id}`} className="text-primary hover:underline">
                        {a.house ?? "granja"}: {STATUS_ALERT_LABEL[a.status]}
                      </Link>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>
      ) : (
        <Section title="Alertas">
          <AlertTable alerts={d.list} />
        </Section>
      )}
      <Section title="Estatística por regra" description='"Útil" é a resposta à pergunta "Este alerta foi útil?" ao encerrar (Parte 10.3).'>
        <Table>
          <THead>
            <TR>
              <TH>Regra</TH>
              <TH className="text-right">Total</TH>
              <TH className="text-right">Abertos</TH>
              <TH className="text-right">Úteis</TH>
              <TH className="text-right">Não úteis</TH>
              <TH className="text-right">% útil</TH>
            </TR>
          </THead>
          <TBody>
            {d.stats.map((s) => (
              <TR key={s.rule}>
                <TD>
                  <span className="font-mono text-xs">{s.rule}</span> {s.name}
                </TD>
                <TD className="text-right">{s.total}</TD>
                <TD className="text-right">{s.open}</TD>
                <TD className="text-right">{s.useful}</TD>
                <TD className="text-right">{s.notUseful}</TD>
                <TD className="text-right">{s.useful + s.notUseful ? fmtPct((s.useful / (s.useful + s.notUseful)) * 100, 0) : "—"}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Section>
    </div>
  );
}
