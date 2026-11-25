import type { Metadata } from "next";
import Link from "next/link";
import { getScope } from "@/server/services/context";
import { getPendingQuestions, getOpenAlerts } from "@/server/services/home-extra";
import { scopedHouseCodes } from "@/server/services/metrics-query";
import { QuestionCard } from "@/components/alerts/question-card";
import { AckButton } from "@/components/field/ack-button";
import { houseColor } from "@/lib/colors";

export const metadata: Metadata = { title: "Campo" };

export default async function CampoPage() {
  const scope = await getScope();
  const [houses, questions, alerts] = await Promise.all([scopedHouseCodes(scope), getPendingQuestions(scope), getOpenAlerts(scope, 20)]);
  return (
    <div className="mx-auto max-w-lg space-y-5">
      <h1 className="text-2xl font-semibold">Campo</h1>
      {questions.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Perguntas da plataforma</h2>
          {questions.map((q) => (
            <QuestionCard key={q.id} q={q} big />
          ))}
        </section>
      )}
      <section>
        <h2 className="mb-2 text-lg font-semibold">Escolha o galpão</h2>
        <div className="grid grid-cols-2 gap-3">
          {houses.map((h) => (
            <Link key={h} href={`/campo/${h}`} className="flex h-20 items-center justify-center rounded-xl border-2 bg-white text-2xl font-bold shadow-sm active:scale-95" style={{ borderColor: houseColor(h) }}>
              {h}
            </Link>
          ))}
        </div>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Alertas dos meus galpões</h2>
        {alerts.length === 0 && <p className="text-muted-foreground">Nenhum alerta aberto.</p>}
        {alerts.map((a) => (
          <div key={a.id} className="rounded-xl border bg-white p-3">
            <div className="font-medium">{a.title}</div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">{a.status === "aberto" ? "ninguém verificou ainda" : a.status === "reconhecido" ? "alguém está verificando" : "em investigação"}</span>
              {a.status === "aberto" && <AckButton id={a.id} />}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
