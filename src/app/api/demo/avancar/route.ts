import { NextResponse } from "next/server";
import { withScope } from "@/server/api";
import { audit } from "@/server/audit";
import { advanceDays } from "@/server/services/advance";

export const maxDuration = 60;

/** Dispara o avanço diário manualmente (diretor), igual ao cron. */
export const POST = withScope(async (scope) => {
  if (!scope.canDemo) return NextResponse.json({ error: "Somente a diretoria usa o painel de demonstração." }, { status: 403 });
  const r = await advanceDays({ trigger: "manual" });
  await audit(scope.user.id, "avancar_dia", "job_runs", null, null, { dias: r.generated });
  return NextResponse.json({ ok: true, ...r });
});
