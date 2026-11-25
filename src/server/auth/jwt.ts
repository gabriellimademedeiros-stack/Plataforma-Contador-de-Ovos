/** JWT HS256 da sessão (Parte 17.2). Funciona no proxy e no servidor. */
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "ovos_session";
export const SESSION_HOURS = 8;

export interface SessionClaims {
  sub: string; // user id
  email: string;
  name: string;
  role: "diretor" | "gerente" | "encarregado";
}

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET ausente ou curto (mínimo 32 caracteres).");
  return new TextEncoder().encode(s);
}

export async function signSession(c: SessionClaims): Promise<string> {
  return new SignJWT({ email: c.email, name: c.name, role: c.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(c.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_HOURS}h`)
    .sign(secret());
}

export async function verifySession(token: string | undefined | null): Promise<SessionClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    if (!payload.sub) return null;
    return { sub: payload.sub, email: String(payload.email), name: String(payload.name), role: payload.role as SessionClaims["role"] };
  } catch {
    return null;
  }
}
