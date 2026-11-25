import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { CounterSimulator } from "@/components/demo/counter-simulator";
import { getScope } from "@/server/services/context";

export const metadata = { title: "Contador ao vivo" };

export default async function ContadorAoVivoPage() {
  const scope = await getScope();
  if (!scope.canDemo) redirect("/");
  return (
    <div className="space-y-4">
      <PageHeader title="Simulador de contador ao vivo" description="A cada 3 segundos, o servidor envia para cada galpão e pista uma mensagem com a contagem de 1 minuto (típica das 08h daquele galpão) para a rota de ingestão, como faria o equipamento real. O token do dispositivo nunca vai para o navegador." />
      <CounterSimulator houses={[...scope.houseCodes].sort()} />
    </div>
  );
}
