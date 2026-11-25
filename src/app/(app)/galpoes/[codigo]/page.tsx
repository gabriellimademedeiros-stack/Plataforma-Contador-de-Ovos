import type { Metadata } from "next";
import Link from "next/link";
import { CalendarPlus } from "lucide-react";
import { getScope } from "@/server/services/context";
import {
  getAgeCurve,
  getHouseAlerts,
  getHouseAmbience,
  getHouseContext,
  getHouseDevices,
  getHouseHeader,
  getHouseHealth,
  getHouseMiniCards,
  getHouseNotes,
  getHouseNutrition,
  getHouseProduction,
  getHouseQuality,
  getSyncedPanel,
  getWeeklyTable,
} from "@/server/services/house";
import { resolveFilters, type SearchParams } from "@/lib/filters";
import { AgeCurveChart, BarChart, Heatmap, Pareto, SyncedPanel, TimeSeriesChart } from "@/components/charts";
import { Sparkline } from "@/components/charts/sparkline";
import { Section, EmptyState } from "@/components/layout/page-header";
import { TabNav } from "@/components/house/tab-nav";
import { AskButton } from "@/components/house/ask-button";
import { HouseNotes } from "@/components/house/notes";
import { HouseFinanceTab } from "@/components/house/tab-finance";
import { HouseEventsTab } from "@/components/house/tab-events";
import { LiveTodayCard } from "@/components/house/live-today";
import { AlertTable } from "@/components/alerts/alert-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { STATUS_BG, StatusDot } from "@/components/kpi/status";
import { fmtAge, fmtDate, fmtDateTime, fmtInt, fmtNumber, fmtPct } from "@/lib/format";
import { CATEGORY_LABEL, CERTAINTY_LABEL } from "@/engine/impacts/event-types";

export async function generateMetadata({ params }: { params: Promise<{ codigo: string }> }): Promise<Metadata> {
  const { codigo } = await params;
  return { title: `Galpão ${codigo.toUpperCase()}` };
}

export default async function HousePage({ params, searchParams }: { params: Promise<{ codigo: string }>; searchParams: Promise<SearchParams> }) {
  const { codigo } = await params;
  const sp = await searchParams;
  const scope = await getScope();
  if (/^P\d{3}$/i.test(codigo) && !scope.houseCodes.has(codigo.toUpperCase()))
    return (
      <div className="mx-auto max-w-lg space-y-3 rounded-xl border bg-white p-6 text-center">
        <h1 className="text-lg font-semibold">Galpão {codigo.toUpperCase()}</h1>
        <p className="text-sm text-slate-600">Seu perfil não tem acesso a este galpão. Galpões que você pode ver: {[...scope.houseCodes].sort().join(", ")}.</p>
        <Link href="/granja" className="inline-block rounded-md bg-emerald-700 px-4 py-2 text-sm text-white">
          Ver a granja
        </Link>
      </div>
    );
  const ctx = await getHouseContext(scope, codigo);
  const header = await getHouseHeader(ctx);
  const tabs = [
    { key: "resumo", label: "Resumo" },
    { key: "producao", label: "Produção" },
    { key: "qualidade", label: "Qualidade" },
    { key: "sanidade", label: "Sanidade" },
    { key: "nutricao", label: "Nutrição" },
    { key: "ambiencia", label: "Ambiência" },
    ...(scope.canSeeFinance ? [{ key: "financeiro", label: "Financeiro" }] : []),
    { key: "eventos", label: "Eventos" },
    { key: "dispositivos", label: "Dispositivos" },
  ];
  const tab = tabs.some((t) => t.key === sp.aba) ? (sp.aba as string) : "resumo";
  const f = resolveFilters(sp, ctx.refDate, "30d");
  const keep = new URLSearchParams(Object.entries(sp).filter(([k, v]) => k !== "aba" && typeof v === "string") as [string, string][]).toString();

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card p-4 shadow-sm" style={{ borderLeft: `6px solid ${header.color}` }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">
              {header.code} <span className="text-base font-normal text-muted-foreground">· {header.name}</span>
            </h1>
            {header.flock ? (
              <div className="mt-1 text-sm text-muted-foreground">
                Lote <b className="text-foreground">{header.flock}</b> · {header.strain} · {fmtAge(header.ageDays)} · {header.phase}
              </div>
            ) : (
              <div className="mt-1 text-sm text-muted-foreground">Galpão em vazio sanitário.</div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link href={`/eventos/novo?galpao=${header.code}`}>
                <CalendarPlus /> Registrar evento
              </Link>
            </Button>
            <AskButton question={`Como está o ${header.code}?`} context={{ galpao: header.code, lote: header.flock, rota: `/galpoes/${header.code}` }} />
          </div>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
          <Info label="Aves alojadas" value={fmtInt(header.housed)} />
          <Info label="Aves presentes" value={fmtInt(header.present)} />
          <Info label="Viabilidade" value={fmtPct(header.viability, 2)} />
          <Info label="Descarte previsto" value={fmtDate(header.plannedCull)} />
          <Info label="Δ resfriamento do galpão" value={`${fmtNumber(header.coolingDelta, 1)} °C`} />
          <Info label="Dados até" value={fmtDate(ctx.refDate)} />
        </dl>
      </div>

      <LiveTodayCard house={header.code} />

      <TabNav base={`/galpoes/${header.code}`} tabs={tabs} active={tab} query={keep} />

      {tab === "resumo" && <SummaryTab scope={scope} ctx={ctx} />}
      {tab === "producao" && <ProductionTab scope={scope} ctx={ctx} days={f.days} />}
      {tab === "qualidade" && <QualityTab scope={scope} ctx={ctx} days={f.days} canSeeFinance={scope.canSeeFinance} />}
      {tab === "sanidade" && <HealthTab scope={scope} ctx={ctx} days={f.days} />}
      {tab === "nutricao" && <NutritionTab scope={scope} ctx={ctx} days={f.days} />}
      {tab === "ambiencia" && <AmbienceTab scope={scope} ctx={ctx} />}
      {tab === "financeiro" && scope.canSeeFinance && <HouseFinanceTab scope={scope} house={header.code} />}
      {tab === "eventos" && <HouseEventsTab scope={scope} house={header.code} />}
      {tab === "dispositivos" && <DevicesTab ctx={ctx} />}
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}

type TabProps = { scope: Awaited<ReturnType<typeof getScope>>; ctx: Awaited<ReturnType<typeof getHouseContext>> };

async function SummaryTab({ scope, ctx }: TabProps) {
  const [age, panel, cards, table, alerts, notes] = await Promise.all([
    getAgeCurve(scope, ctx),
    getSyncedPanel(scope, ctx),
    getHouseMiniCards(scope, ctx),
    getWeeklyTable(scope, ctx),
    getHouseAlerts(scope, ctx),
    getHouseNotes(ctx),
  ]);
  return (
    <div className="space-y-4">
      <Section title="Últimos 60 dias — temperatura, ração, água e postura" description="Cursor e zoom sincronizados. Faixas e bandeiras são eventos (clique para abrir); alfinetes são alertas.">
        <SyncedPanel specs={panel} height={190} />
      </Section>
      <div className="grid gap-4 xl:grid-cols-2">
        <Section title="Postura por semana de idade">{age ? <AgeCurveChart spec={age} height={340} /> : <EmptyState title="Sem lote alojado" />}</Section>
        <Section title="Indicadores (últimos 30 dias)">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {cards.map((c) => (
              <div key={c.metric} className="rounded-lg border p-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  {c.name} <StatusDot status={c.status} className="size-2" />
                </div>
                <div className="font-semibold tabular-nums">
                  {fmtNumber(c.last, c.decimals)} <span className="text-xs font-normal text-muted-foreground">{c.unit}</span>
                </div>
                <Sparkline data={c.series} width={130} height={26} />
              </div>
            ))}
          </div>
        </Section>
      </div>
      <Section title="Tabela semanal (formato da Análise Semanal)" description="Últimas 12 semanas do lote atual; células coloridas pelas metas.">
        <Table>
          <THead>
            <TR>
              <TH>Semana</TH>
              <TH>Idade</TH>
              {table.columns.map((c) => (
                <TH key={c.key} className="text-right">
                  {c.label}
                </TH>
              ))}
            </TR>
          </THead>
          <TBody>
            {table.rows.map((r) => (
              <TR key={r.weekStart}>
                <TD>
                  {r.label}
                  {r.partial && <span className="ml-1 text-xs text-muted-foreground">(em andamento)</span>}
                </TD>
                <TD>{r.ageWeek} sem</TD>
                {table.columns.map((c) => (
                  <TD key={c.key} className="p-0.5 text-right">
                    <span className={`block rounded px-2 py-1 tabular-nums ${r.cells[c.key].status !== "cinza" ? STATUS_BG[r.cells[c.key].status] : ""}`}>{fmtNumber(r.cells[c.key].value, c.decimals)}</span>
                  </TD>
                ))}
              </TR>
            ))}
          </TBody>
        </Table>
      </Section>
      <div className="grid gap-4 xl:grid-cols-2">
        <Section title="Alertas do lote" description="Abertos e fechados">
          <AlertTable alerts={alerts} compact />
        </Section>
        <Section title="Anotações da equipe">
          <HouseNotes house={ctx.house.code} notes={notes} />
        </Section>
      </div>
    </div>
  );
}

async function ProductionTab({ scope, ctx, days }: TabProps & { days: number }) {
  const d = await getHouseProduction(scope, ctx, days);
  const { HouseForecast } = await import("@/components/house/house-forecast");
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Section title="Postura" className="xl:col-span-2">
        <TimeSeriesChart spec={d.posture} height={300} />
      </Section>
      <Section title="Ovos e caixas">
        <TimeSeriesChart spec={d.eggs} />
      </Section>
      <Section title="Ovo por ave alojada">
        <TimeSeriesChart spec={d.oaa} />
      </Section>
      <Section title="Peso do ovo e massa">
        <TimeSeriesChart spec={d.weight} />
      </Section>
      <Section title="Horário de postura">
        <Heatmap spec={d.laying} />
      </Section>
      <Section title="Previsão de 8 semanas" className="xl:col-span-2">
        <HouseForecast scope={scope} house={ctx.house.code} />
      </Section>
    </div>
  );
}

async function QualityTab({ scope, ctx, days, canSeeFinance }: TabProps & { days: number; canSeeFinance: boolean }) {
  const d = await getHouseQuality(scope, ctx, days);
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Section title="Classes do contador" className="xl:col-span-2" description="Contador simulado — nota de confiança fictícia.">
        <TimeSeriesChart spec={d.classes} height={300} />
      </Section>
      <Section title="Pistas lado a lado">
        <TimeSeriesChart spec={d.lanes} />
      </Section>
      <Section title="Sujos de fezes por pista">
        <TimeSeriesChart spec={d.lanesDirty} />
      </Section>
      <Section title="Pareto de defeitos">
        <Pareto spec={d.pareto} />
      </Section>
      <Section title="Comparação das pistas" description={`Período de ${fmtDate(d.period.from)} a ${fmtDate(d.period.to)}`}>
        <Table>
          <THead>
            <TR>
              <TH>Indicador</TH>
              <TH className="text-right">Pista 1</TH>
              <TH className="text-right">Pista 2</TH>
            </TR>
          </THead>
          <TBody>
            {d.laneTable.map((r) => (
              <TR key={r.label}>
                <TD>{r.label}</TD>
                <TD className="text-right tabular-nums">{fmtNumber(r.p1, 2)}</TD>
                <TD className="text-right tabular-nums">{fmtNumber(r.p2, 2)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
        {canSeeFinance && (
          <div className="mt-3 rounded-md bg-amber-50 p-3 text-sm">
            Perda estimada por defeitos no período: <b>{d.loss == null ? "—" : `R$ ${fmtNumber(d.loss, 2)}`}</b> <span className="text-xs text-muted-foreground">(Estimado)</span>
          </div>
        )}
      </Section>
    </div>
  );
}

async function HealthTab({ scope, ctx, days }: TabProps & { days: number }) {
  const d = await getHouseHealth(scope, ctx, days);
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Section title="Mortalidade diária" className="xl:col-span-2">
        <TimeSeriesChart spec={d.daily} height={280} />
      </Section>
      <Section title="Mortalidade acumulada">
        <TimeSeriesChart spec={d.cumulative} />
      </Section>
      <Section title="Mortes por causa">
        <BarChart spec={d.causes} />
      </Section>
      <Section title="Eventos sanitários" className="xl:col-span-2">
        {d.sanitary.length === 0 ? (
          <EmptyState title="Nenhum evento sanitário no período" />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Data</TH>
                <TH>Tipo</TH>
                <TH>Título</TH>
                <TH>Certeza</TH>
              </TR>
            </THead>
            <TBody>
              {d.sanitary.map((e) => (
                <TR key={e.id}>
                  <TD>{fmtDateTime(e.startsAt)}</TD>
                  <TD>{e.typeName}</TD>
                  <TD>
                    <Link href={`/eventos/${e.id}`} className="text-primary hover:underline">
                      {e.title}
                    </Link>
                  </TD>
                  <TD>
                    <Badge variant="outline">{CERTAINTY_LABEL[e.certainty]}</Badge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
        <div className="mt-2 text-xs text-muted-foreground">Vacinas registradas no período: {d.vaccines.length}. Categoria: {CATEGORY_LABEL.sanitario}.</div>
      </Section>
    </div>
  );
}

async function NutritionTab({ scope, ctx, days }: TabProps & { days: number }) {
  const d = await getHouseNutrition(scope, ctx, days);
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Section title="Ração">
        <TimeSeriesChart spec={d.feed} />
      </Section>
      <Section title="Água">
        <TimeSeriesChart spec={d.water} />
      </Section>
      <Section title="Relação água:ração">
        <TimeSeriesChart spec={d.ratio} />
      </Section>
      <Section title="Conversões">
        <TimeSeriesChart spec={d.conversion} />
      </Section>
      <Section title="Peso corporal e uniformidade">
        <TimeSeriesChart spec={d.body} />
      </Section>
      <Section title="Cargas de ração recebidas" description="Com os outros galpões que receberam a mesma carga.">
        <Table>
          <THead>
            <TR>
              <TH>Carga</TH>
              <TH>Entrega</TH>
              <TH>Galpões</TH>
              <TH className="text-right">R$/kg</TH>
              <TH className="text-right">Cálcio esperado</TH>
            </TR>
          </THead>
          <TBody>
            {d.batches.map((b) => (
              <TR key={b.code}>
                <TD className="font-mono text-xs">{b.code}</TD>
                <TD>{fmtDate(b.deliveredOn)}</TD>
                <TD>{b.houses.join(", ")}</TD>
                <TD className="text-right tabular-nums">{fmtNumber(b.price, 2)}</TD>
                <TD className="text-right tabular-nums">{fmtNumber(b.calcium, 1)}%</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Section>
    </div>
  );
}

async function AmbienceTab({ scope, ctx }: TabProps) {
  const d = await getHouseAmbience(scope, ctx);
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Section title="Temperatura por hora" className="xl:col-span-2">
        <TimeSeriesChart spec={d.hourly} height={300} />
      </Section>
      <Section title="Mapa hora × dia" className="xl:col-span-2">
        <Heatmap spec={d.heat} />
      </Section>
      <Section title="Horas e graus-hora acima do limite">
        <TimeSeriesChart spec={d.hours} />
      </Section>
      <Section title="Umidade e amônia">
        <TimeSeriesChart spec={d.humidity} />
      </Section>
      <Section title="Resfriamento" className="xl:col-span-2">
        <TimeSeriesChart spec={d.cooling} />
      </Section>
    </div>
  );
}

async function DevicesTab({ ctx }: { ctx: TabProps["ctx"] }) {
  const devices = await getHouseDevices(ctx);
  return (
    <Section title="Dispositivos do galpão" description="Contador simulado — nota de confiança fictícia.">
      <Table>
        <THead>
          <TR>
            <TH>Código</TH>
            <TH>Tipo</TH>
            <TH>Situação</TH>
            <TH>Última mensagem</TH>
            <TH>Versão do modelo</TH>
            <TH>Firmware</TH>
            <TH className="text-right">Nota de confiança</TH>
            <TH className="text-right">Indeterminados (ontem)</TH>
          </TR>
        </THead>
        <TBody>
          {devices.map((d) => (
            <TR key={d.code}>
              <TD className="font-mono text-xs">{d.code}</TD>
              <TD>{d.type === "contador" ? "Contador" : "Gateway"}</TD>
              <TD>
                <Badge variant={d.status === "online" ? "ok" : d.status === "offline" ? "bad" : "secondary"}>{d.status}</Badge>
              </TD>
              <TD>{fmtDateTime(d.lastSeen)}</TD>
              <TD>{d.model ?? "—"}</TD>
              <TD>{d.firmware ?? "—"}</TD>
              <TD className="text-right">{d.confidence == null ? "—" : fmtPct(d.confidence * 100, 1)}</TD>
              <TD className="text-right">{d.type === "contador" ? fmtPct(d.undetermined, 2) : "—"}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </Section>
  );
}
