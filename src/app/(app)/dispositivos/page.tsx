import Link from "next/link";
import { PageHeader, Section } from "@/components/layout/page-header";
import { getScope } from "@/server/services/context";
import { listDevices } from "@/server/services/devices";
import { fmtDateTime, fmtNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AutoRefresh } from "@/components/layout/auto-refresh";

export const metadata = { title: "Dispositivos" };

const BADGE: Record<string, string> = { online: "bg-emerald-100 text-emerald-800", offline: "bg-red-100 text-red-800", simulado: "bg-slate-100 text-slate-700" };

export default async function DispositivosPage() {
  const scope = await getScope();
  const rows = await listDevices(scope);
  const table = (type: "contador" | "gateway") => (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-slate-500">
            <th className="py-1">Dispositivo</th>
            <th>Galpão</th>
            <th>Situação</th>
            <th>Última mensagem</th>
            {type === "contador" && <th>Modelo</th>}
            <th>Firmware</th>
            {type === "contador" && <th className="text-right">Confiança</th>}
            {type === "contador" && <th className="text-right">Indeterminados ontem</th>}
            <th className="text-right">Temp. do equipamento</th>
            {type === "contador" && <th className="text-right">Completude (10 min)</th>}
          </tr>
        </thead>
        <tbody>
          {rows
            .filter((r) => r.type === type)
            .map((r) => (
              <tr key={r.code} className="border-b">
                <td className="py-1.5 font-mono">{r.code}</td>
                <td>
                  <Link className="text-emerald-800 hover:underline" href={`/galpoes/${r.house}?aba=dispositivos`}>
                    {r.house}
                  </Link>
                </td>
                <td>
                  <span className={cn("rounded px-1.5 py-0.5 text-xs font-medium", BADGE[r.status])}>{r.status}</span>
                </td>
                <td className="text-xs">{r.lastMessage ? `${fmtDateTime(r.lastMessage)}${r.live ? " (ao vivo)" : " (simulada)"}` : "—"}</td>
                {type === "contador" && <td className="text-xs">{r.model ?? "—"}</td>}
                <td className="text-xs">{r.firmware ?? "—"}</td>
                {type === "contador" && <td className="text-right tabular-nums">{r.confidence != null ? `${fmtNumber(r.confidence * 100, 0)}%` : "—"}</td>}
                {type === "contador" && <td className="text-right tabular-nums">{r.undeterminedYesterday != null ? `${fmtNumber(r.undeterminedYesterday, 2)}%` : "—"}</td>}
                <td className="text-right tabular-nums">{r.temperature != null ? `${fmtNumber(r.temperature, 1)} °C` : "—"}</td>
                {type === "contador" && <td className={cn("text-right tabular-nums", r.completeness10 != null && r.completeness10 < 0.8 && "font-semibold text-red-700")}>{r.completeness10 != null ? `${fmtNumber(r.completeness10 * 100, 0)}%` : "—"}</td>}
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
  return (
    <div className="space-y-4">
      <AutoRefresh seconds={15} />
      <PageHeader title="Dispositivos" description="Contadores de ovos com câmera (um por galpão, duas pistas) e gateways. Na beta, os dados são simulados; um contador que recebe mensagens ao vivo aparece online com a hora da última mensagem e fica offline depois de 2 minutos sem mensagens." />
      <Section title="Contadores" description="Confiança e temperatura do equipamento são fictícias. Indeterminados = ovos que o modelo não conseguiu classificar no último dia completo.">
        {table("contador")}
      </Section>
      <Section title="Gateways">{table("gateway")}</Section>
    </div>
  );
}
