/** Briefing do dia (Parte 14.4): 5 linhas determinísticas geradas a partir dos números. */
export interface BriefingInput {
  date: string;
  eggs: number | null;
  eggsPrev: number | null;
  posture: number | null;
  posturePrev: number | null;
  newAlerts: Array<{ title: string; severity: string }>;
  openAlerts: number;
  critical: number;
  heatWarning: string | null;
  worstHouse: { house: string; reason: string } | null;
  pendingQuestions: number;
  marginNegative: string[];
}

const nf = (v: number, d = 1) => new Intl.NumberFormat("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);

export function briefing(i: BriefingInput): string[] {
  const lines: string[] = [];
  if (i.eggs != null && i.eggsPrev != null) {
    const d = i.eggs - i.eggsPrev;
    lines.push(`Ontem (${i.date.slice(8, 10)}/${i.date.slice(5, 7)}) a granja produziu ${nf(i.eggs, 0)} ovos (${nf(i.eggs / 360, 0)} caixas), ${d >= 0 ? "+" : "−"}${nf(Math.abs(d), 0)} contra o dia anterior; postura de ${nf(i.posture ?? 0)}%${i.posturePrev != null ? ` (${i.posture! - i.posturePrev >= 0 ? "+" : "−"}${nf(Math.abs(i.posture! - i.posturePrev))} p.p.)` : ""}.`);
  }
  lines.push(i.newAlerts.length ? `Alertas novos nas últimas 24 horas: ${i.newAlerts.map((a) => a.title).slice(0, 3).join("; ")}.` : "Nenhum alerta novo nas últimas 24 horas.");
  lines.push(`${i.openAlerts} alerta(s) em aberto${i.critical ? `, ${i.critical} crítico(s)` : ""}${i.pendingQuestions ? `; ${i.pendingQuestions} pergunta(s) aguardando o encarregado` : ""}.`);
  if (i.worstHouse) lines.push(`Merece atenção: ${i.worstHouse.house} — ${i.worstHouse.reason}.`);
  if (i.heatWarning) lines.push(i.heatWarning);
  else if (i.marginNegative.length) lines.push(`Margem negativa (estimada): ${i.marginNegative.join(", ")}.`);
  return lines.slice(0, 5);
}
