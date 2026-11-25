import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSql } from "@/db/client";
import { SESSION_COOKIE, SESSION_HOURS, signSession, verifySession } from "./jwt";
import type { AppUser } from "@/server/permissions";

export async function setSessionCookie(user: AppUser) {
  const token = await signSession({ sub: user.id, email: user.email, name: user.name, role: user.role });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_HOURS * 3600,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

/** Usuário da sessão atual (lido do banco para refletir permissões atualizadas) ou null. */
export async function getSessionUser(): Promise<AppUser | null> {
  const jar = await cookies();
  const claims = await verifySession(jar.get(SESSION_COOKIE)?.value);
  if (!claims) return null;
  const sql = getSql();
  const [u] = await sql`select id, email, name, role, allowed_house_ids, active from app.users where id = ${claims.sub}`;
  if (!u || !u.active) return null;
  return { id: u.id, email: u.email, name: u.name, role: u.role, allowedHouseIds: u.allowed_house_ids ?? null };
}

export async function requireUser(): Promise<AppUser> {
  const u = await getSessionUser();
  if (!u) redirect("/login");
  return u;
}
