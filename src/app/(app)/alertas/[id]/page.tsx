import type { Metadata } from "next";
import Link from "next/link";
import { getScope } from "@/server/services/context";
import { getAlertDetail } from "@/server/services/alert-detail";
import { PageHeader, Section, EmptyState } from "@/components/layout/page-header";
import { SyncedPanel, TimeSeriesChart } from "@/components/charts";
import { AlertActions } from "@/components/alerts/alert-actions";
import { HypothesisCards } from "@/components/alerts/hypothesis-cards";
import { InsightBlocks } from "@/components/alerts/insight-blocks";
import { QuestionCard } from "@/components/alerts/question-card";
import { STATUS_ALERT_LABEL } from "@/components/alerts/alert-table";
import { Badge } from "@/components/ui/badge";
import { SEVERITY_LABEL } from "@/engine/impacts/event-types";
import { EXTRA_CAUSES, KNOWLEDGE_BASE, causeName } from "@/engine/causes/knowledge-base";
import { fmtAge, fmtDate, fmtDateTime, fmtNumber } from "@/lib/format";

export const metadata: Metadata = { title: "Alerta" };

export default async function AlertaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scope = await getScope();
  const a = await getAlertDetail(scope, id);
  const causes = [...a.hypotheses.map((h) => ({ code: h.code, name: h.name })), ...KNOWLEDGE_BASE.filter((k) => !a.hypotheses.some((h) => h.code === k.code)).map((k) => ({ code: k.code, name: k.name })), ...EXTRA_CAUSES];
  const obs = a.observed as { value?: number; reference?: number; deviation?: number };
  return (
    <div className="space-y-4">
      <PageHeader
        title={a.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant={a.severity === "critica" || a.severity === "alta" ? "bad" : a.severity === "aviso" ? "purple" : "warn"}>{SEVERITY_LABEL[a.severity]}</Badge>
            <Badge variant="outline">{STATUS_ALERT_LABEL[a.status]}</Badge>
            <span>
              {a.rule} — {a.ruleName}
            </span>
          </span>
        }
      />
      <Section title="Resumo">
        <dl className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4 lg:grid-cols-6">
          <Item label="Galpão" value={a.house ? <Link className="text-primary hover:underline" href={`/galpoes/${a.house}`}>{a.house}</Link> : "Granja"} />
          <Item label="Lote · linhagem" value={a.flock ? `${a.flock} · ${a.strain ?? ""}` : "—"} />
          <Item label="Idade na abertura" value={fmtAge(a.ageDays)} />
          <Item label="Primeiro desvio" value={fmtDate(a.firstDeviationOn)} />
          <Item label="Aberto em" value={fmtDateTime(a.openedAt)} />
          <Item label="Visto pela última vez" value={fmtDate(a.lastSeenOn)} />
          <Item label="Valor observado" value={fmtNumber(obs.value ?? null, 2)} />
          <Item label="Referência" value={fmtNumber(obs.reference ?? null, 2)} />
          <Item label="Desvio" value={fmtNumber(obs.deviation ?? null, 2)} />
          {a.closedOn && <Item label="Encerrado em" value={fmtDate(a.closedOn)} />}
          {a.causeCode && <Item label="Causa registrada" value={causeName(a.causeCode)} />}
          {a.incident && <Item label="Incidente" value={a.incident.title} />}
        </dl>
        <p className="mt-2 text-xs text-muted-foreground">{a.ruleDescription}</p>
        {a.conditionClearedOn && ["aberto", "reconhecido", "em_investigacao"].includes(a.status) && (
          <p className="mt-2 rounded-md bg-amber-50 p-2 text-sm text-amber-900">Condição normalizada em {fmtDate(a.conditionClearedOn)} — registre a causa para encerrar.</p>
        )}
        {(a.causeNote || a.actionTaken || a.discardReason) && (
          <p className="mt-2 text-sm">
            {a.causeNote && <span>Nota: {a.causeNote}. </span>}
            {a.actionTaken && <span>Ação: {a.actionTaken}. </span>}
            {a.discardReason && <span>Motivo do descarte: {a.discardReason}. </span>}
            {a.wasUseful != null && <span>Útil: {a.wasUseful ? "sim" : "não"}.</span>}
            {a.silencedUntil && <span> Regra silenciada neste galpão até {fmtDate(a.silencedUntil)} (nova condição aceita).</span>}
          </p>
        )}
        <div className="mt-3">
          <AlertActions id={a.id} status={a.status} house={a.house} canResolve={scope.canResolveAlerts} causes={causes} conditionPersists={!a.conditionClearedOn} title={a.title} />
        </div>
      </Section>

      {a.observedChart && (
        <Section title="O que foi observado">
          <TimeSeriesChart spec={a.observedChart} height={280} />
        </Section>
      )}
      {a.panel.length > 0 && (
        <Section title="Sinais relacionados no período" description="Temperatura, ração, água, postura e os outros galpões, com eventos marcados.">
          <SyncedPanel specs={a.panel} height={150} />
        </Section>
      )}

      <Section title="Hipóteses de causa" description="Pontuação determinística (regras + estatística). É uma hipótese, não um diagnóstico.">
        {a.hypotheses.length === 0 ? <EmptyState title="Hipóteses ainda não calculadas" /> : <HypothesisCards hypotheses={a.hypotheses} />}
      </Section>

      <InsightBlocks decomposition={a.decomposition} similar={a.similar} whatToKnow={a.whatToKnow} explanation={a.explanation} canSeeFinance={scope.canSeeFinance} />

      {a.question && (
        <Section title="Pergunta ao encarregado">
          {a.question.answered ? (
            <p className="text-sm">
              <b>{a.question.question}</b>
              <br />
              Resposta: {a.question.options.find((o) => o.code === a.question!.answered!.code)?.label} — {a.question.answered.by ?? "—"} em {fmtDateTime(a.question.answered.at)}
            </p>
          ) : scope.houseCodes.has(a.question.house) && scope.user.role === "encarregado" ? (
            <QuestionCard q={a.question} />
          ) : (
            <p className="text-sm">
              <b>{a.question.question}</b> <span className="text-muted-foreground">— aguardando a resposta do encarregado.</span>
            </p>
          )}
        </Section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Eventos ligados">
          {a.links.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum evento ligado.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {a.links.map((l) => (
                <li key={l.id}>
                  <Link href={`/eventos/${l.id}`} className="text-primary hover:underline">
                    {l.title}
                  </Link>{" "}
                  <span className="text-xs text-muted-foreground">({l.certainty})</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Histórico do alerta">
          <ol className="space-y-1 text-sm">
            {a.timeline.map((t, i) => (
              <li key={i}>
                <span className="text-xs text-muted-foreground">{t.at.length > 10 ? fmtDateTime(t.at) : fmtDate(t.at)}</span> · {t.text}
              </li>
            ))}
          </ol>
        </Section>
      </div>
    </div>
  );
}

function Item({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
