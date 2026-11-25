import { notFound } from "next/navigation";
import { getSql } from "@/db/client";
import { MeetingMode, type Decision } from "@/components/reports/meeting-mode";
import { getScope } from "@/server/services/context";
import { getRefDate } from "@/server/repositories/reference";
import { reportForViewer } from "@/server/services/reports/runs";
import { addDays, isISODate, lastCompleteWeekStart, weekLabel, weekStart } from "@/lib/dates";

export const maxDuration = 60;
export const metadata = { title: "Modo reunião" };

export default async function ReuniaoPage({ params }: { params: Promise<{ semana: string }> }) {
  const { semana } = await params;
  if (!isISODate(semana)) notFound();
  const ws = weekStart(semana);
  const [scope, ref] = await Promise.all([getScope(), getRefDate()]);
  if (ws > lastCompleteWeekStart(ref)) notFound();
  const { model } = await reportForViewer("semanal", scope, ws);
  const sql = getSql();
  const q = (w: string) => sql`select id, week_start::text as week_start, text, owner_name, due_date::text as due_date, status from app.decisions where week_start = ${w} order by created_at`;
  const [previous, current] = await Promise.all([q(addDays(ws, -7)), q(ws)]);
  return (
    <>
      <style>{"@page { size: A4 portrait; margin: 15mm; } @media print { body * { visibility: hidden } .meeting-summary, .meeting-summary * { visibility: visible } .meeting-summary { position: absolute; left: 0; top: 0 } }"}</style>
      <MeetingMode model={model} previous={previous as unknown as Decision[]} current={current as unknown as Decision[]} canEdit={scope.canEditDecisions} week={ws} prevLabel={weekLabel(addDays(ws, -7))} />
    </>
  );
}
