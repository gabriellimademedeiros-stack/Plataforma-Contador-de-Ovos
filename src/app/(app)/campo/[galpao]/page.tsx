import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSql } from "@/db/client";
import { getScope } from "@/server/services/context";
import { getOpenAlerts, getPendingQuestions } from "@/server/services/home-extra";
import { FIELD_CAUSES, FIELD_EVENT_TYPES } from "@/server/services/field";
import { getFlocks, currentFlockOf } from "@/server/repositories/reference";
import { EVENT_TYPE_BY_CODE } from "@/engine/impacts/event-types";
import { currentProductiveDate } from "@/lib/dates";
import { houseColor } from "@/lib/colors";
import { QuestionCard } from "@/components/alerts/question-card";
import { AckButton } from "@/components/field/ack-button";
import { FieldApp } from "@/components/field/field-app";

export const metadata = { title: "Campo" };

/** Entrada direta por link (simula o QR code da porta do galpão). */
export default async function CampoGalpaoPage({ params }: { params: Promise<{ galpao: string }> }) {
  const { galpao } = await params;
  const house = galpao.toUpperCase();
  const scope = await getScope();
  if (!/^P\d{3}$/.test(house)) notFound();
  if (!scope.houseCodes.has(house))
    return (
      <div className="mx-auto max-w-lg space-y-3 p-2">
        <h1 className="text-2xl font-semibold">{house}</h1>
        <p className="text-lg">Você não tem acesso a este galpão.</p>
        <Link href="/campo" className="text-lg text-emerald-700 underline">
          Escolher outro galpão
        </Link>
      </div>
    );
  const day = currentProductiveDate();
  const sql = getSql();
  const [flocks, questions, alerts, [rec]] = await Promise.all([
    getFlocks(),
    getPendingQuestions(scope),
    getOpenAlerts(scope, 30),
    sql`select d.deaths, d.feed_kg, d.water_l from app.daily_records d join app.houses h on h.id = d.house_id where h.code = ${house} and d.date = ${day}`,
  ]);
  const f = currentFlockOf(flocks, house, day);
  const myQ = questions.filter((q) => q.house === house);
  const myA = alerts.filter((a) => a.house === house);
  return (
    <div className="mx-auto max-w-lg space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/campo" aria-label="Voltar" className="rounded-full border bg-white p-2">
          <ArrowLeft className="size-6" />
        </Link>
        <h1 className="text-3xl font-bold" style={{ color: houseColor(house) }}>
          {house}
        </h1>
      </div>
      <FieldApp
        house={house}
        flock={f?.code ?? null}
        causes={[...FIELD_CAUSES]}
        eventTypes={FIELD_EVENT_TYPES.map((c) => ({ code: c, name: EVENT_TYPE_BY_CODE[c]?.name ?? c }))}
        today={{ deaths: Number(rec?.deaths ?? 0), feedKg: rec?.feed_kg != null ? Number(rec.feed_kg) : null, water: rec?.water_l != null ? Number(rec.water_l) : null }}
        aiEnabled={Boolean(process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_MODEL)}
      />
      {myQ.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Perguntas da plataforma</h2>
          {myQ.map((q) => (
            <QuestionCard key={q.id} q={q} big />
          ))}
        </section>
      )}
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Alertas do {house}</h2>
        {myA.length === 0 && <p className="text-lg text-muted-foreground">Nenhum alerta aberto.</p>}
        {myA.map((a) => (
          <div key={a.id} className="rounded-xl border bg-white p-3">
            <div className="text-lg font-medium">{a.title}</div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-sm text-muted-foreground">{a.status === "aberto" ? "ninguém verificou ainda" : a.status === "reconhecido" ? "alguém está verificando" : "em investigação"}</span>
              {a.status === "aberto" && <AckButton id={a.id} />}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
