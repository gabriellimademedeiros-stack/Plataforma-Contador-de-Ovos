/**
 * Estados de demonstração (Parte 10.7): como a equipe "tratou" os alertas do histórico.
 * Recebe os alertas do backtest e devolve o estado final de cada um.
 */
import { addDays } from "@/lib/dates";
import { userIdFor } from "@/lib/ids";
import type { EngineAlert } from "@/engine/alerts/engine";
import type { ScenarioInfo } from "./scenarios";

const GERENTE = userIdFor("gerente@demo.local");
const ENCARREGADO = userIdFor("encarregado@demo.local");

export interface AlertFinalState {
  status: "aberto" | "reconhecido" | "em_investigacao" | "resolvido" | "descartado";
  closedOn: string | null;
  ackBy: string | null;
  ackOn: string | null;
  resolvedBy: string | null;
  causeCode: string | null;
  causeNote: string | null;
  actionTaken: string | null;
  wasUseful: boolean | null;
  discardReason: string | null;
  silencedUntil: string | null;
  scenario: string | null;
  needsQuestion: boolean;
}

const HIST_CAUSE: Record<string, { cause: string; action: string }> = {
  H1: { cause: "estresse_termico", action: "nebulização reforçada" },
  H2: { cause: "estresse_termico", action: "nebulização reforçada" },
  H3: { cause: "doenca_infecciosa", action: "acompanhamento veterinário; sorologia" },
  H4: { cause: "falha_agua", action: "troca do regulador de pressão da linha" },
  H5: { cause: "ovos_grandes_prolapso", action: "redução da intensidade de luz" },
  H6: { cause: "equipamento_esteira", action: "alinhamento da transição e troca de roletes da pista 1" },
};

/** Associa cada alerta ao cenário que o explica (o primeiro cuja janela e galpões batem). */
export function scenarioOf(a: EngineAlert, scenarios: ScenarioInfo[]): string | null {
  if (a.rule === "P01") return "P01";
  const order = ["S9", "S3", "S5", "S8", "S6", "S2", "S4", "S1", "H6", "H4", "H5", "H3", "H1", "H2"];
  for (const code of order) {
    const s = scenarios.find((x) => x.code === code);
    if (!s || (a.house && !s.houses.includes(a.house))) continue;
    const winEnd = code === "S1" ? addDays(s.start, 8) : code === "S2" || code === "H3" ? addDays(s.end, 2) : addDays(s.end, 3);
    if (a.firstDeviationOn < addDays(s.start, -2) || a.firstDeviationOn > winEnd) continue;
    // regras compatíveis com o cenário
    const ok: Record<string, string[]> = {
      S1: ["A11", "A09", "A03", "A05", "A08"],
      S2: ["A08", "A03", "A05", "A14", "A04", "A09"],
      S3: ["A08", "A09", "A03"],
      S4: ["A14"],
      S5: ["A15", "A14"],
      S6: ["A17", "A06"],
      S8: ["A16"],
      S9: ["A11", "A06", "A03"],
      H1: ["A11", "A09", "A03", "A05", "A08"],
      H2: ["A11", "A09", "A03", "A05", "A08"],
      H3: ["A08", "A03", "A05", "A14", "A04", "A09"],
      H4: ["A08", "A09", "A03", "A05"],
      H5: ["A17", "A06", "A05"],
      H6: ["A15", "A14"],
    };
    if (ok[code]?.includes(a.rule)) return code;
  }
  return null;
}

/**
 * `bestHeatCause` decide entre estresse_termico e resfriamento_insuficiente para A11 sem cenário (a de maior nota).
 */
export function demoStateFor(a: EngineAlert, scenarios: ScenarioInfo[], dEnd: string, bestHeatCause: (a: EngineAlert) => string): AlertFinalState {
  const d = (o: number) => addDays(dEnd, o);
  const sc = scenarioOf(a, scenarios);
  const base: AlertFinalState = { status: "aberto", closedOn: null, ackBy: null, ackOn: null, resolvedBy: null, causeCode: null, causeNote: null, actionTaken: null, wasUseful: null, discardReason: null, silencedUntil: null, scenario: sc, needsQuestion: false };
  const resolved = (on: string, by: string, cause: string, action: string | null, note: string | null = null, useful = true): AlertFinalState => ({ ...base, status: "resolvido", closedOn: on, ackBy: by, ackOn: a.openedOn, resolvedBy: by, causeCode: cause, causeNote: note, actionTaken: action, wasUseful: useful });
  switch (sc) {
    case "S1":
      return resolved(d(-13), GERENTE, "estresse_termico", "nebulização reforçada");
    case "S2": {
      const r = resolved(d(-20), GERENTE, "doenca_infecciosa", "coleta para sorologia", "bronquite confirmada por sorologia");
      if (["A03", "A04", "A05"].includes(a.rule)) r.silencedUntil = addDays(d(-20), 60);
      return r;
    }
    case "S3":
      return resolved(d(-9), ENCARREGADO, "falha_agua", "registro da linha 2 reaberto");
    case "S4":
      return { ...base, status: "em_investigacao", ackBy: GERENTE, ackOn: d(-11), causeNote: "suspeita na carga de ração; amostra enviada ao laboratório" };
    case "S5":
      return base;
    case "S6":
      return resolved(d(-6), GERENTE, "ovos_grandes_prolapso", "redução da intensidade de luz");
    case "S8":
      return { ...base, needsQuestion: true };
    case "S9":
      return resolved(d(-10), GERENTE, "falha_energia_ventilacao", "manutenção do gerador");
    case "P01":
      return base;
    case "H1":
    case "H2":
    case "H3":
    case "H4":
    case "H5":
    case "H6": {
      const h = HIST_CAUSE[sc];
      return resolved(a.conditionClearedOn ?? addDays(a.openedOn, 3), GERENTE, h.cause, h.action);
    }
  }
  if (a.rule === "A22" && a.house === "P007" && a.openedOn >= d(-21)) return base;
  if (a.openedOn > d(-7)) return base; // ruído recente: aberto
  if (a.rule === "A11") return resolved(a.conditionClearedOn ?? addDays(a.openedOn, 2), GERENTE, bestHeatCause(a), null, "calor do período");
  return { ...base, status: "descartado", closedOn: a.conditionClearedOn ?? addDays(a.openedOn, 3), ackBy: GERENTE, ackOn: a.openedOn, resolvedBy: GERENTE, discardReason: "variação normal", wasUseful: false };
}
