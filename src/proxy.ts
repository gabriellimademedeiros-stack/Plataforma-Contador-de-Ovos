import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/server/auth/jwt";

const PUBLIC = [/^\/login$/, /^\/api\/auth\/login$/, /^\/api\/ingest\//, /^\/api\/cron\//, /^\/api\/saude(\/conexoes)?$/];

/** Redireciona telas sem sessão para /login e devolve 401 em JSON para APIs (Parte 17.2). */
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((r) => r.test(pathname))) return NextResponse.next();
  const claims = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (claims) return NextResponse.next();
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Sessão expirada ou ausente. Entre novamente." }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname !== "/" ? `?next=${encodeURIComponent(pathname + req.nextUrl.search)}` : "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt).*)"],
};
