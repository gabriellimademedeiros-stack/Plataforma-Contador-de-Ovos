import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql } from "@/db/client";
import { withScope } from "@/server/api";

const Body = z.object({ all: z.boolean().optional(), ids: z.array(z.string().uuid()).optional() });

export const POST = withScope(async (scope, req: Request) => {
  const body = Body.parse(await req.json().catch(() => ({})));
  const sql = getSql();
  const ids = [...scope.houseIds];
  const targets = body.ids?.length
    ? body.ids
    : (
        await sql`select id from app.notifications where (user_id = ${scope.user.id} or user_id is null)
          and (house_id is null or house_id in ${sql(ids.length ? ids : ["00000000-0000-0000-0000-000000000000"])})`
      ).map((r) => r.id as string);
  for (let i = 0; i < targets.length; i += 500) {
    const chunk = targets.slice(i, i + 500).map((id) => ({ notification_id: id, user_id: scope.user.id }));
    if (chunk.length) await sql`insert into app.notification_reads ${sql(chunk)} on conflict do nothing`;
  }
  return NextResponse.json({ ok: true, marked: targets.length });
});
