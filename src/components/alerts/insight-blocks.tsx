import Link from "next/link";
import { Section } from "@/components/layout/page-header";
import { Waterfall } from "@/components/charts";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { causeName } from "@/engine/causes/knowledge-base";
import { fmtDate, fmtNumber, fmtPct } from "@/lib/format";
import { ExplainWithAI } from "./explain-ai";

interface Decomp {
  kind?: "postura" | "margem";
  steps?: Array<{ label: string; value: number }>;
  sentence?: string;
  unit?: string;
}

export function InsightBlocks({ decomposition, similar, whatToKnow, explanation, canSeeFinance }: { decomposition: Record<string, unknown> | null; similar: Array<Record<string, unknown>>; whatToKnow: string[]; explanation: string | null; canSeeFinance: boolean }) {
  const d = decomposition as Decomp | null;
  const showDecomp = d?.steps?.length && (d.kind !== "margem" || canSeeFinance);
  return (
    <>
      {showDecomp && (
        <Section title={d!.kind === "margem" ? "Ponte da margem (Estimado)" : "Decomposição do desvio"} description={d!.sentence}>
          <Waterfall spec={{ kind: "waterfall", unit: d!.unit ?? "p.p.", decimals: d!.kind === "margem" ? 0 : 1, series: [{ name: "Decomposição", data: d!.steps!.map((s) => [s.label, s.value]) }] }} height={280} />
        </Section>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Casos parecidos" description="Eventos confirmados e alertas resolvidos com causa, comparados pela impressão digital.">
          {similar.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum caso com semelhança ≥ 60%.</p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Data</TH>
                  <TH>Galpão · lote</TH>
                  <TH>Causa</TH>
                  <TH className="text-right">Semelhança</TH>
                  <TH className="text-right">Recuperação</TH>
                </TR>
              </THead>
              <TBody>
                {similar.map((s, i) => (
                  <TR key={i}>
                    <TD>
                      <Link href={String(s.link ?? "#")} className="text-primary hover:underline">
                        {fmtDate(String(s.date))}
                      </Link>
                    </TD>
                    <TD>
                      {String(s.house)} · {String(s.flock ?? "—")}
                      {s.ageWeek != null ? ` (${String(s.ageWeek)} sem)` : ""}
                    </TD>
                    <TD>
                      {causeName(String(s.cause))}
                      {s.action ? <div className="text-xs text-muted-foreground">{String(s.action)}</div> : null}
                    </TD>
                    <TD className="text-right tabular-nums">{fmtPct(Number(s.similarity) * 100, 0)}</TD>
                    <TD className="text-right tabular-nums">{s.recoveryDays != null ? `${fmtNumber(Number(s.recoveryDays), 0)} dias` : "—"}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
          {similar.length > 0 && similar.length < 3 && <p className="mt-2 text-xs text-amber-800">Poucos casos: trate como indício, não como padrão.</p>}
        </Section>
        <Section title="O que falta saber">
          {whatToKnow.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todos os sinais das principais hipóteses puderam ser verificados.</p>
          ) : (
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {whatToKnow.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ul>
          )}
          {explanation && (
            <div className="mt-3 rounded-md bg-slate-50 p-3 text-sm">
              <div className="mb-1 text-xs font-medium text-muted-foreground">Explicação (texto automático)</div>
              {explanation}
              <ExplainWithAI text={explanation} />
            </div>
          )}
        </Section>
      </div>
    </>
  );
}
