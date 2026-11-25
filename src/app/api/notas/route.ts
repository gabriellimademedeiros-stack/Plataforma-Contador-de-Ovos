import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql } from "@/db/client";
import { withScope } from "@/server/api";
import { assertHouse } from "@/server/permissions";
import { audit } from "@/server/audit";

const Body = z.object({ house: z.string().regex(/^P\d{3}$/, "galpão inválido"), text: z.string().trim().min(1, "escreva a anotação").max(2000) });

export const POST = withScope(async (scope, req: Request) => {
  const b = Body.parse(await req.json());
  assertHouse(scope, b.house);
  const sql = getSql();
  const [row] = await sql`insert into app.house_notes (house_id, user_id, text) select id, ${scope.user.id}, ${b.text} from app.houses where code = ${b.house} returning id`;
  await audit(scope.user.id, "criar", "house_notes", row.id, null, b);
  return NextResponse.json({ ok: true, id: row.id });
});
