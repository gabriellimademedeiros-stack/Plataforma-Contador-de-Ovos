import { NextResponse } from "next/server";
import { getSql } from "@/db/client";
import { withScope } from "@/server/api";

/** Notificações do usuário: as dirigidas a ele e as gerais dos galpões que ele vê. */
export const GET = withScope(async (scope) => {
  const sql = getSql();
  const ids = [...scope.houseIds];
  const rows = await sql`
    select n.id, n.title, n.body, n.link, n.created_at, n.kind,
      coalesce(n.read_at, r.read_at) as read_at
    from app.notifications n
    left join app.notification_reads r on r.notification_id = n.id and r.user_id = ${scope.user.id}
    left join app.alerts a on a.id = n.alert_id
    where (n.user_id = ${scope.user.id} or n.user_id is null)
      and (n.house_id is null or n.house_id in ${sql(ids.length ? ids : ["00000000-0000-0000-0000-000000000000"])})
      and (${scope.canSeeFinance} or coalesce(a.rule_code, '') <> 'A22')
    order by n.created_at desc limit 30`;
  const items = rows.map((r) => ({ id: r.id, title: r.title, body: r.body, link: r.link, createdAt: new Date(r.created_at).toISOString(), read: !!r.read_at }));
  return NextResponse.json({ items, unread: items.filter((i) => !i.read).length });
});
