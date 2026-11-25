/** Eventos semeados (Parte 7.13). S4, S5 e S8 não têm evento: a plataforma precisa descobrir sozinha. */
import { addDays, farmInstant, productiveDate } from "@/lib/dates";
import { userIdFor, uuidFromName } from "@/lib/ids";
import type { Certainty, CertaintyChange, EventRecord, Flock, Severity } from "@/engine/types";
import { HEAT_WAVES, type ScenarioDates } from "./scenarios";

const GERENTE = userIdFor("gerente@demo.local");
const ENCARREGADO = userIdFor("encarregado@demo.local");

interface Mk {
  key: string;
  type: string;
  title: string;
  houses: string[];
  start: [string, number, number?];
  end?: [string, number, number?] | null;
  created: [string, number, number?];
  by: string;
  certainty: Certainty;
  confirmedBy?: EventRecord["confirmedBy"];
  severity?: Severity;
  description?: string | null;
  details?: Record<string, unknown>;
  action?: string | null;
  history?: CertaintyChange[];
  scenario?: string;
}

export function buildSeededEvents(opts: {
  dEnd: string;
  to: string;
  dates: ScenarioDates;
  flocks: Flock[];
  activeHousesAt: (date: string) => string[];
}): EventRecord[] {
  const { dEnd, dates, flocks } = opts;
  const d = (o: number) => addDays(dEnd, o);
  const flockAt = (house: string, date: string) =>
    flocks.find((f) => f.houseCode === house && f.startDate <= date && (f.endDate == null || date <= f.endDate));

  const make = (m: Mk): EventRecord => {
    const startsAt = farmInstant(m.start[0], m.start[1], m.start[2] ?? 0).toISOString();
    const endsAt = m.end ? farmInstant(m.end[0], m.end[1], m.end[2] ?? 0).toISOString() : null;
    const createdAt = farmInstant(m.created[0], m.created[1], m.created[2] ?? 0).toISOString();
    const startDate = productiveDate(new Date(startsAt));
    const endDate = endsAt ? productiveDate(new Date(endsAt)) : null;
    const fl: Record<string, string> = {};
    for (const h of m.houses) {
      const f = flockAt(h, startDate);
      if (f) fl[h] = f.code;
    }
    return {
      id: uuidFromName(`event:${m.key}`),
      typeCode: m.type,
      title: m.title,
      startsAt,
      endsAt,
      startDate,
      endDate,
      severity: m.severity ?? "media",
      certainty: m.certainty,
      confirmedBy: m.confirmedBy ?? null,
      description: m.description ?? null,
      details: m.details ?? {},
      actionTaken: m.action ?? null,
      costBrl: null,
      source: "simulado",
      createdBy: m.by,
      createdAt,
      completeness: "completo",
      houses: m.houses.filter((h) => fl[h]),
      flocks: fl,
      certaintyHistory: m.history ?? [{ at: createdAt, from: null, to: m.certainty, by: m.by, note: null }],
      scenario: m.scenario,
    };
  };

  const ev: EventRecord[] = [];
  const s1Houses = opts.activeHousesAt(d(-20));

  // S1 — onda de calor
  ev.push(
    make({
      key: "S1",
      type: "ambiente.onda_calor",
      title: "Onda de calor",
      houses: s1Houses,
      start: [d(-20), 6],
      end: [d(-16), 23],
      created: [d(-19), 8, 10],
      by: GERENTE,
      certainty: "confirmado",
      severity: "alta",
      description: "Máximas externas acima de 38 °C por cinco dias.",
      action: "nebulização reforçada, ração nas horas frescas",
      scenario: "S1",
    }),
  );

  // S2 — bronquite no P003: registrada como suspeita em D−42 (início D−43) e corrigida para D−45 e confirmada em D−32
  {
    const createdAt = farmInstant(d(-42), 16, 30).toISOString();
    const confirmedAt = farmInstant(d(-32), 10, 0).toISOString();
    ev.push(
      make({
        key: "S2",
        type: "sanitario.doenca",
        title: "Bronquite infecciosa",
        houses: ["P003"],
        start: [d(-45), 6],
        end: null,
        created: [d(-42), 16, 30],
        by: GERENTE,
        certainty: "confirmado",
        confirmedBy: "laboratorio",
        severity: "alta",
        description: "Sinais respiratórios e queda de consumo de água. Início corrigido de D−43 para D−45 após a sorologia.",
        details: {
          agente: "bronquite infecciosa",
          metodo_diagnostico: "sorologia",
          aves_afetadas: 110000,
          sinais_clinicos: ["sinais respiratórios", "queda de postura", "casca fina"],
          inicio_registrado_originalmente: d(-43),
        },
        action: "coleta para sorologia",
        history: [
          { at: createdAt, from: null, to: "suspeito", by: GERENTE, note: "Sinais respiratórios, queda de água." },
          { at: confirmedAt, from: "suspeito", to: "confirmado", by: GERENTE, note: "Sorologia positiva para bronquite infecciosa (laboratório)." },
        ],
        scenario: "S2",
      }),
    );
  }

  // S3 — bebedouro no P006
  ev.push(
    make({
      key: "S3",
      type: "estrutura.manutencao_bebedouro",
      title: "Registro fechado na linha 2",
      houses: ["P006"],
      start: [d(-9), 6],
      end: [d(-9), 13],
      created: [d(-9), 13, 40],
      by: ENCARREGADO,
      certainty: "confirmado",
      description: "Registro fechado na linha 2; corrigido às 13h.",
      action: "registro da linha 2 reaberto",
      scenario: "S3",
    }),
  );

  // S6 — prolapso e programa de luz no P008
  ev.push(
    make({
      key: "S6a",
      type: "sanitario.prolapso",
      title: "Aumento de prolapso",
      houses: ["P008"],
      start: [d(-21), 6],
      end: [d(-7), 23],
      created: [d(-15), 9, 0],
      by: GERENTE,
      certainty: "confirmado",
      confirmedBy: "clinica",
      severity: "alta",
      description: "Aumento de mortes por prolapso e de ovos com sangue no lote jovem.",
      scenario: "S6",
    }),
  );
  ev.push(
    make({
      key: "S6b",
      type: "manejo.programa_luz",
      title: "Redução da intensidade de luz",
      houses: ["P008"],
      start: [d(-14), 17],
      created: [d(-14), 17, 0],
      by: GERENTE,
      certainty: "confirmado",
      description: "Intensidade reduzida; 16 h → 15,5 h.",
      details: { horas_antes: 16, horas_depois: 15.5, intensidade: "reduzida" },
      action: "redução da intensidade de luz",
      scenario: "S6",
    }),
  );

  // S7 — vacinação de rotina no P002 (sem efeito)
  ev.push(
    make({
      key: "S7",
      type: "sanitario.vacinacao",
      title: "Reforço contra bronquite",
      houses: ["P002"],
      start: [d(-25), 7, 30],
      created: [d(-25), 7, 30],
      by: ENCARREGADO,
      certainty: "confirmado",
      severity: "baixa",
      description: "Reforço contra bronquite, via água.",
      details: { vacina: "Bronquite infecciosa (reforço)", via: "água", partida: "BI-2026-118" },
      scenario: "S7",
    }),
  );

  // S9 — queda de energia no P002 (madrugada do dia produtivo D−12)
  ev.push(
    make({
      key: "S9",
      type: "ambiente.queda_energia",
      title: "Queda de energia à noite",
      houses: ["P002"],
      start: [d(-11), 1, 0],
      end: [d(-11), 4, 0],
      created: [d(-11), 7, 10],
      by: GERENTE,
      certainty: "confirmado",
      severity: "critica",
      description: "Gerador não partiu.",
      action: "manutenção do gerador",
      scenario: "S9",
    }),
  );

  // H1 e H2 — ondas de calor históricas
  for (const k of ["H1", "H2"] as const) {
    const hw = HEAT_WAVES[k];
    const start = d(hw.start);
    const end = addDays(start, hw.waveDays - 1);
    ev.push(
      make({
        key: k,
        type: "ambiente.onda_calor",
        title: "Onda de calor",
        houses: opts.activeHousesAt(start),
        start: [start, 6],
        end: [end, 23],
        created: [addDays(start, 1), 8, 0],
        by: GERENTE,
        certainty: "confirmado",
        severity: "alta",
        action: "nebulização reforçada",
        scenario: k,
      }),
    );
  }

  // H3 — bronquite confirmada no P005 (lote anterior)
  if (dates.H3) {
    const s = dates.H3.start;
    const c1 = farmInstant(addDays(s, 3), 15, 0).toISOString();
    const c2 = farmInstant(addDays(s, 13), 11, 0).toISOString();
    ev.push(
      make({
        key: "H3",
        type: "sanitario.doenca",
        title: "Bronquite infecciosa",
        houses: ["P005"],
        start: [s, 6],
        created: [addDays(s, 3), 15, 0],
        by: GERENTE,
        certainty: "confirmado",
        confirmedBy: "laboratorio",
        severity: "alta",
        details: { agente: "bronquite infecciosa", metodo_diagnostico: "sorologia", sinais_clinicos: ["sinais respiratórios", "queda de postura"] },
        action: "acompanhamento veterinário; separação de ovos deformados",
        history: [
          { at: c1, from: null, to: "suspeito", by: GERENTE, note: "Queda de água e sinais respiratórios." },
          { at: c2, from: "suspeito", to: "confirmado", by: GERENTE, note: "Sorologia positiva." },
        ],
        scenario: "H3",
      }),
    );
  }

  // H4 — bebedouro no P002
  ev.push(
    make({
      key: "H4",
      type: "estrutura.manutencao_bebedouro",
      title: "Falha de bebedouro",
      houses: ["P002"],
      start: [d(-200), 6],
      end: [d(-200), 14],
      created: [d(-200), 14, 30],
      by: ENCARREGADO,
      certainty: "confirmado",
      action: "troca do regulador de pressão da linha",
      scenario: "H4",
    }),
  );

  // H5 — prolapso no P004 (lote anterior)
  if (dates.H5) {
    const s = dates.H5.start;
    ev.push(
      make({
        key: "H5",
        type: "sanitario.prolapso",
        title: "Aumento de prolapso",
        houses: ["P004"],
        start: [s, 6],
        end: [addDays(s, 14), 23],
        created: [addDays(s, 5), 9, 0],
        by: GERENTE,
        certainty: "confirmado",
        confirmedBy: "clinica",
        action: "redução da intensidade de luz",
        scenario: "H5",
      }),
    );
  }

  // H6 — esteira da pista 1 no P001
  ev.push(
    make({
      key: "H6",
      type: "estrutura.manutencao_esteira",
      title: "Problema na esteira da pista 1",
      houses: ["P001"],
      start: [d(-150), 6],
      end: [d(-146), 18],
      created: [d(-146), 18, 0],
      by: GERENTE,
      certainty: "confirmado",
      description: "Transição desalinhada na pista 1; encerrado por manutenção.",
      action: "alinhamento da transição e troca de roletes da pista 1",
      scenario: "H6",
    }),
  );

  // Rotina: vacinação aos 30, 45, 60 e 75 semanas; troca de fase de ração aos 40 e 65 semanas
  for (const f of flocks) {
    for (const w of [30, 45, 60, 75]) {
      const day = addDays(f.hatchDate, w * 7);
      if (!inLife(f, day, opts)) continue;
      ev.push(
        make({
          key: `vac:${f.code}:${w}`,
          type: "sanitario.vacinacao",
          title: `Vacinação de rotina (${w} semanas)`,
          houses: [f.houseCode],
          start: [day, 7, 30],
          created: [day, 7, 30],
          by: ENCARREGADO,
          certainty: "confirmado",
          severity: "baixa",
          details: { vacina: "Newcastle + bronquite (rotina)", via: "água" },
          scenario: "rotina",
        }),
      );
    }
    for (const w of [40, 65]) {
      const day = addDays(f.hatchDate, w * 7);
      if (!inLife(f, day, opts)) continue;
      ev.push(
        make({
          key: `racao:${f.code}:${w}`,
          type: "manejo.troca_racao",
          title: "Troca de fase de ração",
          houses: [f.houseCode],
          start: [day, 7, 0],
          created: [day, 7, 0],
          by: GERENTE,
          certainty: "confirmado",
          severity: "baixa",
          details: { formulacao_anterior: "Postura fase única", formulacao_nova: "Postura fase única (ajuste de fase)", motivo: "troca de fase de ração" },
          scenario: "rotina",
        }),
      );
    }
  }
  return ev.filter((e) => e.houses.length > 0).sort((a, b) => (a.startsAt < b.startsAt ? -1 : 1));
}

function inLife(f: Flock, day: string, opts: { dEnd: string; to: string }) {
  const start = addDays(opts.dEnd, -1095);
  return day >= f.startDate && (f.endDate == null || day <= f.endDate) && day >= start && day <= opts.to;
}
