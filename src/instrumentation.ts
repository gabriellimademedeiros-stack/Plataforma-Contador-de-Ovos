import type { Instrumentation } from "next";

/**
 * Registra erros do servidor no banco (job_runs, job = "erro") para diagnóstico na beta publicada,
 * sem depender do painel da Vercel. A rota /api/saude mostra os últimos (sem segredos).
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const e = err as Error & { digest?: string };
    const { getSql } = await import("@/db/client");
    const summary = {
      mensagem: String(e?.message ?? err).slice(0, 500),
      pilha: String(e?.stack ?? "").split("\n").slice(0, 8).join("\n").slice(0, 1500),
      digest: e?.digest ?? null,
      caminho: request.path,
      rota: context.routePath,
      tipo: context.routeType,
    };
    await getSql()`insert into app.job_runs (tenant_id, job, started_at, finished_at, ok, summary)
      select tenant_id, 'erro', now(), now(), false, ${JSON.stringify(summary)}::jsonb from app.farms limit 1`;
  } catch {
    // nunca derrubar a resposta por causa do registro
  }
};
