import { NextResponse } from "next/server";
import { withScope } from "@/server/api";
import { audit } from "@/server/audit";
import { clearLive } from "@/server/services/demo-live";

export const maxDuration = 30;

export const POST = withScope(async (scope) => {
  if (!scope.canDemo) return NextResponse.json({ error: "Somente a diretoria usa o painel de demonstração." }, { status: 403 });
  const r = await clearLive();
  await audit(scope.user.id, "limpar_ao_vivo", "demo", null, null, r.counts);
  return NextResponse.json({ ok: true, ...r });
});
