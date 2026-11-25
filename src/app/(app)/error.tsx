"use client";
/** Erro ao abrir uma tela (Next.js error boundary), em português e sem detalhes técnicos. */
import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.warn("Erro na tela:", error.digest ?? error.message);
  }, [error]);
  return (
    <div className="mx-auto max-w-lg space-y-3 rounded-xl border bg-white p-6 text-center">
      <h1 className="text-lg font-semibold">Não foi possível abrir esta tela</h1>
      <p className="text-sm text-slate-600">Se você chegou por um link, talvez seu perfil não tenha acesso a este galpão ou a estes dados. Também pode ter sido uma falha momentânea.</p>
      <div className="flex justify-center gap-2">
        <Button onClick={() => retry()}>Tentar de novo</Button>
        <Button asChild variant="outline">
          <Link href="/">Ir para o Início</Link>
        </Button>
      </div>
      {error.digest && <p className="text-[11px] text-slate-400">Código para suporte: {error.digest}</p>}
    </div>
  );
}
