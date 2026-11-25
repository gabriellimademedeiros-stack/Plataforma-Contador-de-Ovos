import type { Metadata } from "next";
import Link from "next/link";
import { getScope } from "@/server/services/context";
import { getEventDetail } from "@/server/services/event-detail";
import { PageHeader, Section, EmptyState } from "@/components/layout/page-header";
import { BarChart, SyncedPanel } from "@/components/charts";
import { CertaintyControl } from "@/components/events/certainty-control";
import { AskButton } from "@/components/house/ask-button";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { CERTAINTY_LABEL, SEVERITY_LABEL } from "@/engine/impacts/event-types";
import { FINGERPRINT_METRICS } from "@/engine/impacts/impact";
import { METRIC_BY_CODE } from "@/engine/metrics/catalog";
import { fmtBRL, fmtDate, fmtDateTime, fmtInt, fmtNumber, fmtSigned } from "@/lib/format";
import { EstimatedBadge } from "@/components/kpi/status";

export const metadata: Metadata = { title: "Evento" };

export default async function EventoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scope = await getScope();
  const e = await getEventDetail(scope, id);
  const fp = e.fingerprints.find((f) => f.house === e.mainHouse);
  return (
    <div className="space-y-4">
      <PageHeader
        title={e.title}
        description={
          <span>
            {e.typeName} · {e.houses.map((h) => h.code + (h.flock ? ` (${h.flock})` : "")).join(", ")} · {fmtDateTime(e.startsAt)}
            {e.endsAt ? ` a ${fmtDateTime(e.endsAt)}` : ""}
          </span>
        }
        actions={<AskButton question="Explique o impacto deste evento" context={{ evento: e.id, titulo: e.title, galpoes: e.houses.map((h) => h.code) }} />}
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <Section title="Dados do evento" className="lg:col-span-2">
          <dl className="grid grid-cols-2 gap-3 text-sm md:grid-cols-3">
            <Item label="Tipo" value={e.typeName} />
            <Item label="Severidade" value={SEVERITY_LABEL[e.severity]} />
            <Item label="Certeza" value={<Badge variant={e.certainty === "confirmado" ? "ok" : "warn"}>{CERTAINTY_LABEL[e.certainty]}{e.confirmedBy ? ` (${e.confirmedBy})` : ""}</Badge>} />
            <Item label="Dia produtivo de início" value={fmtDate(e.startDate)} />
            <Item label="Origem" value={e.source} />
            <Item label="Registrado por" value={`${e.author ?? "—"} em ${fmtDateTime(e.createdAt)}`} />
            {e.actionTaken && <Item label="Ação tomada" value={e.actionTaken} />}
            {e.costBrl != null && <Item label="Custo" value={fmtBRL(e.costBrl)} />}
            <Item label="Completude" value={e.completeness} />
            {e.fields.map((f) => (e.details[f.key] != null ? <Item key={f.key} label={f.label} value={Array.isArray(e.details[f.key]) ? (e.details[f.key] as string[]).join(", ") : String(e.details[f.key])} /> : null))}
          </dl>
          {e.description && <p className="mt-3 whitespace-pre-wrap text-sm">{e.description}</p>}
        </Section>
        <Section title="Histórico de certeza">
          <ol className="space-y-2 text-sm">
            {e.history.map((h, i) => (
              <li key={i} className="rounded border p-2">
                <div>
                  {h.from ? `${CERTAINTY_LABEL[h.from]} → ` : ""}
                  <b>{CERTAINTY_LABEL[h.to]}</b>
                </div>
                <div className="text-xs text-muted-foreground">
                  {fmtDateTime(h.at)} · {h.by ?? "—"}
                </div>
                {h.note && <div className="text-xs">{h.note}</div>}
              </li>
            ))}
          </ol>
          <div className="mt-3">
            <CertaintyControl eventId={e.id} current={e.certainty} />
          </div>
        </Section>
      </div>

      <Section title="Retrato de impacto" description={e.windows ? `Base ${fmtDate(e.windows.baseFrom)} a ${fmtDate(e.windows.baseTo)} · efeito ${fmtDate(e.windows.effectFrom)} a ${fmtDate(e.windows.effectTo)} · ${e.windows.closed ? "janela fechada" : "janela aberta (recalculada a cada dia novo)"}` : undefined}>
        {e.summary && <p className="mb-3 rounded-md bg-slate-50 p-3 text-sm">{e.summary}</p>}
        {e.table.length === 0 ? (
          <EmptyState title="Este tipo de evento não tem retrato de impacto" />
        ) : (
          <>
            <div className="mb-2 text-xs text-muted-foreground">
              Galpão {e.mainHouse}. {e.allFarm ? "Sem galpão de controle: o evento atingiu toda a granja." : `Galpões de controle: ${e.controls.join(", ")}. "Diferença contra o controle" = Δ do galpão − mediana dos Δ dos controles.`} Linhas com |z| ≥ 2 destacadas.
            </div>
            <Table>
              <THead>
                <TR>
                  <TH>Indicador</TH>
                  <TH className="text-right">Base</TH>
                  <TH className="text-right">Efeito</TH>
                  <TH className="text-right">Δ</TH>
                  <TH className="text-right">z</TH>
                  <TH className="text-right">Pior valor</TH>
                  <TH className="text-right">Atraso (dias)</TH>
                  <TH className="text-right">Recuperação (dias)</TH>
                  {!e.allFarm && <TH className="text-right">Δ × controle</TH>}
                  <TH className="text-right">Perda</TH>
                </TR>
              </THead>
              <TBody>
                {e.table.map((r) => {
                  const hi = r.z != null && Math.abs(r.z) >= 2;
                  return (
                    <TR key={r.metric} className={hi ? "bg-amber-50 font-medium" : ""}>
                      <TD>
                        {r.name} <span className="text-xs text-muted-foreground">({r.unit})</span>
                      </TD>
                      <TD className="text-right tabular-nums">{fmtNumber(r.base, r.decimals)}</TD>
                      <TD className="text-right tabular-nums">{fmtNumber(r.effect, r.decimals)}</TD>
                      <TD className="text-right tabular-nums">{fmtSigned(r.delta, r.decimals)}</TD>
                      <TD className="text-right tabular-nums">{fmtSigned(r.z, 1)}</TD>
                      <TD className="text-right tabular-nums">{fmtNumber(r.worst, r.decimals)}</TD>
                      <TD className="text-right tabular-nums">{r.lag ?? "—"}</TD>
                      <TD className="text-right tabular-nums">{r.recovery ?? (e.windows?.closed ? "não recuperou" : "—")}</TD>
                      {!e.allFarm && <TD className="text-right tabular-nums">{fmtSigned(r.controlDiff, r.decimals)}</TD>}
                      <TD className="text-right tabular-nums">
                        {r.lossEggs != null ? (
                          <span>
                            {fmtInt(Math.round(r.lossEggs))} ovos{r.lossBrl != null ? ` · ${fmtBRL(r.lossBrl)}` : ""}
                          </span>
                        ) : (
                          "—"
                        )}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
            {scope.canSeeFinance && (
              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <EstimatedBadge /> Perda em R$ = ovos perdidos ÷ 12 × preço do ovo comercial da semana.
              </div>
            )}
          </>
        )}
      </Section>

      {e.specs.length > 0 && (
        <Section title="Antes e depois" description="Dia 0 marcado; tracejado = mediana dos galpões de controle.">
          <SyncedPanel specs={e.specs} height={170} />
        </Section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {fp && (
          <Section title="Impressão digital" description="z de cada indicador (ajustado pelo controle quando há controle), limitado a ±6.">
            <BarChart
              spec={{
                kind: "bar",
                unit: "z",
                decimals: 1,
                categories: FINGERPRINT_METRICS.map((m) => METRIC_BY_CODE[m].short),
                series: [{ name: "z", type: "bar", data: FINGERPRINT_METRICS.map((m, i) => [METRIC_BY_CODE[m].short, fp.vector[i]] as [string, number]), colors: fp.vector.map((v) => (v >= 2 ? "#dc2626" : v <= -2 ? "#2563eb" : "#9ca3af")) }],
                refLines: [{ name: "+2", y: 2, color: "#9ca3af", dashed: true }, { name: "−2", y: -2, color: "#9ca3af", dashed: true }],
              }}
            />
          </Section>
        )}
        <Section title="Alertas ligados e resumos por galpão">
          {e.links.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum alerta ligado a este evento.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {e.links.map((l) => (
                <li key={l.id}>
                  <Link href={`/alertas/${l.id}`} className="text-primary hover:underline">
                    {l.rule} · {l.title}
                  </Link>{" "}
                  <span className="text-xs text-muted-foreground">({l.status})</span>
                </li>
              ))}
            </ul>
          )}
          {Object.keys(e.summaries).length > 1 && (
            <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
              {Object.entries(e.summaries).filter(([h]) => scope.houseCodes.has(h)).map(([h, s]) => (
                <li key={h}>{s}</li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}

function Item({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
