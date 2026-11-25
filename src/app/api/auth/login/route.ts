import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { getSql } from "@/db/client";
import { setSessionCookie } from "@/server/auth/session";
import { errorResponse } from "@/server/api";

const Body = z.object({ email: z.string().trim().toLowerCase().email("e-mail inválido"), password: z.string().min(1, "informe a senha") });

const MAX_FAILS = 5;
const WINDOW_MIN = 10;

export async function POST(req: Request) {
  try {
    const { email, password } = Body.parse(await req.json());
    const sql = getSql();
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const [{ fails }] = await sql`select count(*)::int as fails from app.login_attempts
      where email = ${email} and success = false and at > now() - make_interval(mins => ${WINDOW_MIN})`;
    if (fails >= MAX_FAILS) {
      return NextResponse.json(
        { error: `Muitas tentativas erradas. Aguarde ${WINDOW_MIN} minutos e tente de novo.` },
        { status: 429 },
      );
    }
    const [u] = await sql`select id, email, name, role, password_hash, allowed_house_ids, active from app.users where email = ${email}`;
    const ok = !!u && u.active && (await bcrypt.compare(password, u.password_hash));
    await sql`insert into app.login_attempts (email, ip, success) values (${email}, ${ip}, ${ok})`;
    if (!ok) {
      const left = MAX_FAILS - fails - 1;
      return NextResponse.json(
        { error: left > 0 ? `E-mail ou senha incorretos. Restam ${left} tentativa(s).` : `E-mail ou senha incorretos. Acesso bloqueado por ${WINDOW_MIN} minutos.` },
        { status: 401 },
      );
    }
    await setSessionCookie({ id: u.id, email: u.email, name: u.name, role: u.role, allowedHouseIds: u.allowed_house_ids });
    return NextResponse.json({ ok: true, name: u.name, role: u.role });
  } catch (e) {
    return errorResponse(e);
  }
}
