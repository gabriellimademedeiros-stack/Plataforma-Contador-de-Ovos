import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader, Section } from "@/components/layout/page-header";
import { DemoPanel } from "@/components/demo/demo-panel";
import { AdvanceButton } from "@/components/demo/advance-button";
import { getSimState, recentJobRuns } from "@/server/services/advance";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { getScope } from "@/server/services/context";

export const metadata = { title: "Demonstração" };

export default async function DemoPage() {
  const scope = await getScope();
  if (!scope.canDemo) redirect("/");
  const [runs, sim] = await Promise.all([recentJobRuns(8), getSimState()]);
  return (
    <div className="space-y-4">
      <PageHeader
        title="Demonstração ao vivo"
        description="Cenários que acontecem agora, em segundos, para mostrar a plataforma reagindo. Tudo é gravado com origem “ao vivo” e pode ser apagado no botão Limpar."
        actions={
          <>
            <Link href="/demo/contador-ao-vivo" className="rounded-md border bg-white px-3 py-1.5 text-sm hover:border-emerald-400">
              Simulador de contador ao vivo
            </Link>
            <Link href="/demo/validacao" className="rounded-md border bg-white px-3 py-1.5 text-sm hover:border-emerald-400">
              Conferência do simulador
            </Link>
          </>
        }
      />
      <DemoPanel houses={[...scope.houseCodes].sort()} />
      <Section
        title="Avanço diário"
        description={`Todo dia às 06:05 (Fortaleza) o cron gera o dia que fechou com os mesmos modelos do simulador, recalcula indicadores, alertas e retratos e, aos domingos, os relatórios da semana. Último dia gerado: ${sim ? fmtDate(sim.lastDay) : "—"} (âncora dos cenários: ${sim ? fmtDate(sim.anchorEnd) : "—"}).`}
        actions={<AdvanceButton />}
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-slate-500">
              <th className="py-1">Início</th>
              <th>Origem</th>
              <th>Resultado</th>
              <th className="text-right">Alertas novos</th>
              <th className="text-right">Duração</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id} className="border-b">
                <td className="py-1">{fmtDateTime(r.startedAt)}</td>
                <td className="text-xs">{String(r.summary.origem ?? "cron")}</td>
                <td className={r.ok ? "" : "text-red-700"}>{r.ok ? String(r.summary.message ?? "ok") : `Falhou: ${String(r.summary.erro ?? "erro")}`}</td>
                <td className="text-right tabular-nums">{Array.isArray(r.summary.alerts) ? r.summary.alerts.length : "—"}</td>
                <td className="text-right tabular-nums">{typeof r.summary.ms === "number" ? `${(Number(r.summary.ms) / 1000).toFixed(1).replace(".", ",")} s` : "—"}</td>
              </tr>
            ))}
            {runs.length === 0 && (
              <tr>
                <td colSpan={5} className="py-2 text-xs text-slate-500">
                  Nenhuma execução registrada ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Section>
      <Section title="Reset completo da demonstração" description="Recria os 3 anos de dados simulados do zero. Roda só no computador de quem cuida da plataforma (não pela internet).">
        <pre className="rounded bg-slate-900 p-3 text-sm text-emerald-300">npm run demo:reset</pre>
        <p className="mt-2 text-xs text-slate-500">Leva menos de 1 minuto e usa a mesma semente (mesmos dados) com a data final de ontem. Os relatórios das 4 últimas semanas são gerados de novo.</p>
      </Section>
    </div>
  );
}
