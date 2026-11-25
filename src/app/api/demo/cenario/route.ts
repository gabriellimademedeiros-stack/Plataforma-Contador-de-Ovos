import { NextResponse } from "next/server";
import { z } from "zod";
import { withScope } from "@/server/api";
import { audit } from "@/server/audit";
import { runLiveScenario } from "@/server/services/demo-live";

export const maxDuration = 30;
const Body = z.object({ acao: z.enum(["bebedouro", "temperatura", "esteira"]), galpao: z.string().regex(/^P00[1-8]$/) });

/** Cenários ao vivo do painel de demonstração (só diretor). */
export const POST = withScope(async (scope, req: Request) => {
  if (!scope.canDemo) return NextResponse.json({ error: "Somente a diretoria usa o painel de demonstração." }, { status: 403 });
  const b = Body.parse(await req.json());
  const t0 = Date.now();
  const r = await runLiveScenario(b.acao, b.galpao);
  await audit(scope.user.id, "cenario_ao_vivo", "demo", null, null, { ...b, alerts: r.recompute.opened.map((a) => a.id) });
  return NextResponse.json({ ok: true, message: r.message, alerts: r.recompute.opened, ms: Date.now() - t0 });
});
