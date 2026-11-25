import { SimulatedBanner } from "@/components/layout/simulated-banner";

export default function Home() {
  return (
    <>
      <SimulatedBanner />
      <main className="mx-auto max-w-3xl p-8">
        <h1 className="text-2xl font-semibold">Contador de Ovos · Beta</h1>
        <p className="mt-2 text-muted-foreground">Estrutura inicial pronta. As telas chegam nos próximos marcos.</p>
      </main>
    </>
  );
}
