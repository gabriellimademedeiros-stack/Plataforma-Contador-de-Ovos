import { getSql } from "@/db/client";

/** Resumo em texto do retrato de impacto (gravado em event_impacts → events.details.impact_summary no M6). */
export async function EventImpactSummary({ eventId }: { eventId: string }) {
  const sql = getSql();
  const [r] = await sql`select details->>'impact_summary' as s from app.events where id = ${eventId}`;
  if (!r?.s) return null;
  return <p className="mt-0.5 text-xs text-muted-foreground">{r.s}</p>;
}
