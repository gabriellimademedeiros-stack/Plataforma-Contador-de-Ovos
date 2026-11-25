/** App de campo (Parte 14.21): apontamentos do dia corrente no galpão + recálculo imediato. */
import "server-only";
import { z } from "zod";
import { getSql } from "@/db/client";
import { addDays, currentProductiveDate, farmLocalParts } from "@/lib/dates";
import { TENANT_ID } from "@/lib/ids";
import { assertHouse, type Scope } from "@/server/permissions";
import { ApiError } from "@/server/api";
import { audit } from "@/server/audit";
import { getFlocks, currentFlockOf } from "@/server/repositories/reference";
import { createEvent } from "./events";
import { recomputeHouseDay, type RecomputeResult } from "./recompute";

export const FIELD_CAUSES = [
  { code: "desconhecida", label: "Não sei" },
  { code: "calor", label: "Calor" },
  { code: "prolapso", label: "Prolapso" },
  { code: "bicagem", label: "Bicagem" },
  { code: "doenca", label: "Doença" },
  { code: "refugo", label: "Refugo" },
  { code: "outras", label: "Outra" },
] as const;

export const FIELD_EVENT_TYPES = ["sanitario.doenca", "sanitario.vacinacao", "sanitario.prolapso", "ambiente.queda_energia", "ambiente.falta_agua", "estrutura.manutencao_bebedouro", "estrutura.manutencao_esteira", "manejo.troca_racao", "manejo.programa_luz", "estrutura.falha_contador"];

export const FieldEntry = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("mortalidade"), house: z.string(), qtd: z.number().int().min(1).max(20000), causa: z.enum(FIELD_CAUSES.map((c) => c.code) as [string, ...string[]]).default("desconhecida") }),
  z.object({ tipo: z.literal("racao"), house: z.string(), kg: z.number().min(1).max(100000) }),
  z.object({ tipo: z.literal("agua"), house: z.string(), litros: z.number().min(1).max(500000) }),
  z.object({ tipo: z.literal("observacao"), house: z.string(), texto: z.string().trim().min(2).max(2000) }),
  z.object({ tipo: z.literal("evento"), house: z.string(), evento: z.string(), descricao: z.string().trim().max(2000).nullish(), certeza: z.enum(["suspeito", "provavel", "confirmado"]).default("suspeito") }),
]);
export type FieldEntryT = z.infer<typeof FieldEntry>;

/** Garante a linha de daily_records do dia corrente (aves no início = saldo do dia anterior). */
async function ensureToday(house: string, day: string) {
  const sql = getSql();
  const f = currentFlockOf(await getFlocks(), house, day);
  if (!f) throw new ApiError(400, `Não há lote alojado no ${house} hoje.`);
  const [cur] = await sql`select id from app.daily_records where house_id = ${f.houseId} and date = ${day}`;
  if (cur) return cur.id as string;
  const [prev] = await sql`select birds_start - deaths - culls as birds from app.daily_records where house_id = ${f.houseId} and date < ${day} order by date desc limit 1`;
  const [row] = await sql`insert into app.daily_records (tenant_id, house_id, flock_id, date, birds_start, deaths, deaths_by_cause, culls, source)
    values (${TENANT_ID}, ${f.houseId}, ${f.id}, ${day}, ${Number(prev?.birds ?? f.birdsHoused)}, 0, '{}'::jsonb, 0, 'campo') returning id`;
  return row.id as string;
}

export async function registerFieldEntry(scope: Scope, e: FieldEntryT): Promise<{ id: string | null; message: string; recompute: RecomputeResult | null }> {
  assertHouse(scope, e.house);
  const sql = getSql();
  const day = currentProductiveDate();
  let id: string | null = null;
  let message = "Registrado ✓";
  if (e.tipo === "mortalidade") {
    id = await ensureToday(e.house, day);
    const [before] = await sql`select deaths, deaths_by_cause from app.daily_records where id = ${id}`;
    const causes = { ...((before.deaths_by_cause ?? {}) as Record<string, number>) };
    causes[e.causa] = (causes[e.causa] ?? 0) + e.qtd;
    await sql`update app.daily_records set deaths = deaths + ${e.qtd}, deaths_by_cause = ${JSON.stringify(causes)}::jsonb where id = ${id}`;
    await audit(scope.user.id, "criar", "daily_records.mortalidade", id, before, e);
    message = `Registrado ✓ ${e.qtd} morte(s) no ${e.house} hoje (total do dia: ${Number(before.deaths) + e.qtd}).`;
  } else if (e.tipo === "racao") {
    id = await ensureToday(e.house, day);
    const [before] = await sql`select feed_kg from app.daily_records where id = ${id}`;
    await sql`update app.daily_records set feed_kg = coalesce(feed_kg, 0) + ${e.kg} where id = ${id}`;
    await audit(scope.user.id, "criar", "daily_records.racao", id, before, e);
    message = `Registrado ✓ ${e.kg} kg de ração no ${e.house} (total do dia: ${Number(before.feed_kg ?? 0) + e.kg} kg).`;
  } else if (e.tipo === "agua") {
    id = await ensureToday(e.house, day);
    const [before] = await sql`select water_l from app.daily_records where id = ${id}`;
    await sql`update app.daily_records set water_l = ${e.litros} where id = ${id}`;
    await audit(scope.user.id, "criar", "daily_records.agua", id, before, e);
    message = `Registrado ✓ leitura de ${e.litros} L de água no ${e.house} hoje.`;
  } else if (e.tipo === "observacao") {
    const [row] = await sql`insert into app.house_notes (house_id, user_id, text) select id, ${scope.user.id}, ${`[campo] ${e.texto}`} from app.houses where code = ${e.house} returning id`;
    id = row.id;
    await audit(scope.user.id, "criar", "house_notes", id, null, e);
    return { id, message: "Registrado ✓ observação salva na ficha do galpão.", recompute: null };
  } else {
    if (!FIELD_EVENT_TYPES.includes(e.evento)) throw new ApiError(400, "Tipo de evento não disponível no campo.");
    const { hour, minute } = farmLocalParts(new Date());
    const civil = hour < 6 ? addDays(day, 1) : day;
    const { EVENT_TYPE_BY_CODE } = await import("@/engine/impacts/event-types");
    id = await createEvent(scope, {
      typeCode: e.evento,
      houses: [e.house],
      title: `${EVENT_TYPE_BY_CODE[e.evento].name} (registrado no campo)`,
      startsAt: `${civil}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
      endsAt: null,
      severity: "media",
      certainty: e.certeza,
      confirmedBy: null,
      description: e.descricao ?? null,
      details: {},
      actionTaken: null,
      costBrl: null,
      source: "usuario",
    });
    message = "Registrado ✓ evento salvo; o retrato de impacto será acompanhado nos próximos dias.";
  }
  const recompute = await recomputeHouseDay(e.house, day);
  return { id, message, recompute };
}

/** Converte texto ditado em campos de evento (palavras-chave; com IA quando houver chave). */
export function interpretByKeywords(text: string): { evento: string | null; descricao: string } {
  const t = text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const rules: Array<[RegExp, string]> = [
    [/vacin/, "sanitario.vacinacao"],
    [/prolaps/, "sanitario.prolapso"],
    [/(energia|luz caiu|apagou|gerador)/, "ambiente.queda_energia"],
    [/(falt\w* (de )?agua|sem agua|caixa d.?agua)/, "ambiente.falta_agua"],
    [/(bebedouro|bico|vazament)/, "estrutura.manutencao_bebedouro"],
    [/(esteira|rolete|transicao|elevador)/, "estrutura.manutencao_esteira"],
    [/(racao|carga|formula)/, "manejo.troca_racao"],
    [/(programa de luz|lampada|timer)/, "manejo.programa_luz"],
    [/(contador|camera)/, "estrutura.falha_contador"],
    [/(espirr|tosse|respirat|doen|diarr|ronqu)/, "sanitario.doenca"],
  ];
  return { evento: rules.find(([re]) => re.test(t))?.[1] ?? null, descricao: text.trim() };
}
