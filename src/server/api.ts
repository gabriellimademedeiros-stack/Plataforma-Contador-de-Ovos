import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getSessionUser } from "@/server/auth/session";
import { PermissionError, scopeForUser, type Scope } from "@/server/permissions";
import { getHouses } from "@/server/repositories/reference";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function zodMessage(e: ZodError): string {
  const first = e.issues[0];
  const path = first?.path?.join(".") || "entrada";
  return `Dado inválido em "${path}": ${first?.message ?? "verifique os campos"}.`;
}

export function errorResponse(e: unknown) {
  if (e instanceof ZodError) return NextResponse.json({ error: zodMessage(e) }, { status: 400 });
  if (e instanceof PermissionError) return NextResponse.json({ error: e.message }, { status: 403 });
  if (e instanceof ApiError) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error(e);
  return NextResponse.json({ error: "Erro interno. Tente de novo em instantes." }, { status: 500 });
}

/** Envolve uma rota autenticada: sessão + escopo + tratamento de erros em português. */
export function withScope<T extends unknown[]>(handler: (scope: Scope, ...args: T) => Promise<Response>) {
  return async (...args: T): Promise<Response> => {
    try {
      const user = await getSessionUser();
      if (!user) return NextResponse.json({ error: "Sessão expirada ou ausente. Entre novamente." }, { status: 401 });
      const houses = await getHouses();
      return await handler(scopeForUser(user, houses), ...args);
    } catch (e) {
      return errorResponse(e);
    }
  };
}
