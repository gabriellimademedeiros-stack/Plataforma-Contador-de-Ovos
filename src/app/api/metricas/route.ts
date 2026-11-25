import { NextResponse } from "next/server";
import { withScope } from "@/server/api";
import { querySeries, SeriesQuery } from "@/server/services/series-query";

/** Séries para gráficos (métrica, galpões, período, granularidade, eixo), com permissões aplicadas. */
export const GET = withScope(async (scope, req: Request) => {
  const q = SeriesQuery.parse(Object.fromEntries(new URL(req.url).searchParams));
  return NextResponse.json(await querySeries(scope, q));
});
