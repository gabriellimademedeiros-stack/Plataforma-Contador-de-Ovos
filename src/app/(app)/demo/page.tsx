import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader, Section } from "@/components/layout/page-header";
import { DemoPanel } from "@/components/demo/demo-panel";
import { getScope } from "@/server/services/context";

export const metadata = { title: "Demonstração" };

export default async function DemoPage() {
  const scope = await getScope();
  if (!scope.canDemo) redirect("/");
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
      <Section title="Reset completo da demonstração" description="Recria os 3 anos de dados simulados do zero. Roda só no computador de quem cuida da plataforma (não pela internet).">
        <pre className="rounded bg-slate-900 p-3 text-sm text-emerald-300">npm run demo:reset</pre>
        <p className="mt-2 text-xs text-slate-500">Leva menos de 1 minuto e usa a mesma semente (mesmos dados) com a data final de ontem. Os relatórios das 4 últimas semanas são gerados de novo.</p>
      </Section>
    </div>
  );
}
