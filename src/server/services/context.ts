import "server-only";
import { cache } from "react";
import { requireUser } from "@/server/auth/session";
import { scopeForUser, type Scope } from "@/server/permissions";
import { getHouses } from "@/server/repositories/reference";

/** Escopo do usuário da requisição (memorizado por requisição). */
export const getScope = cache(async (): Promise<Scope> => {
  const user = await requireUser();
  const houses = await getHouses();
  return scopeForUser(user, houses);
});

export async function visibleHouses(scope: Scope) {
  const houses = await getHouses();
  return houses.filter((h) => scope.houseCodes.has(h.code));
}
