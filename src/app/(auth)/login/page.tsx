import type { Metadata } from "next";
import { SimulatedBanner } from "@/components/layout/simulated-banner";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

const ACCOUNTS = [
  { email: "diretor@demo.local", role: "Diretor", desc: "vê tudo, inclusive financeiro e painel de demonstração" },
  { email: "gerente@demo.local", role: "Gerente", desc: "todos os galpões e financeiro; configura metas e regras" },
  { email: "encarregado@demo.local", role: "Encarregado", desc: "só P001 a P004, sem financeiro; app de campo" },
];

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <SimulatedBanner />
      <main className="flex flex-1 items-center justify-center p-4">
        <div className="grid w-full max-w-4xl gap-6 md:grid-cols-2">
          <div className="rounded-xl border bg-white p-6 shadow-sm">
            <div className="mb-6">
              <div className="text-2xl font-bold tracking-tight text-primary">
                Contador de Ovos <span className="font-normal text-muted-foreground">· Beta</span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">Granja Demonstração Sertão (fictícia)</p>
            </div>
            <LoginForm next={next && next.startsWith("/") ? next : "/"} />
          </div>
          <div className="rounded-xl border bg-white p-6 shadow-sm">
            <h2 className="font-semibold">Contas de demonstração</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              As três contas usam a mesma senha de demonstração, informada a quem recebeu o acesso.
            </p>
            <ul className="mt-4 space-y-3">
              {ACCOUNTS.map((a) => (
                <li key={a.email} className="rounded-lg border p-3">
                  <div className="font-mono text-sm">{a.email}</div>
                  <div className="text-sm">
                    <span className="font-medium">{a.role}</span> — <span className="text-muted-foreground">{a.desc}</span>
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-muted-foreground">
              Todos os dados são simulados e fictícios. Nenhum dado real de granja é usado nesta versão.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
