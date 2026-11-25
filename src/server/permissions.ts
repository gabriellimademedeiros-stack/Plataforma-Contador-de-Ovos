/**
 * Matriz de permissões da beta (Parte 17.3). Aplicada nos repositórios e serviços, não só escondendo botões.
 */
export type Role = "diretor" | "gerente" | "encarregado";

export interface AppUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  /** null = todos os galpões */
  allowedHouseIds: string[] | null;
}

export interface Scope {
  user: AppUser;
  allHouses: boolean;
  houseIds: Set<string>;
  houseCodes: Set<string>;
  canSeeFinance: boolean;
  canRegister: boolean;
  canAckAlerts: boolean;
  canResolveAlerts: boolean;
  canConfigure: boolean;
  canSeeUsers: boolean;
  canDemo: boolean;
  canEditDecisions: boolean;
}

export const ROLE_LABEL: Record<Role, string> = { diretor: "Diretor", gerente: "Gerente", encarregado: "Encarregado" };

/** Escopo do usuário: galpões que pode ver e o que pode fazer. `houses` = lista completa (id, código). */
export function scopeForUser(user: AppUser, houses: Array<{ id: string; code: string }>): Scope {
  const allowed = user.allowedHouseIds == null ? houses : houses.filter((h) => user.allowedHouseIds!.includes(h.id));
  return {
    user,
    allHouses: user.allowedHouseIds == null,
    houseIds: new Set(allowed.map((h) => h.id)),
    houseCodes: new Set(allowed.map((h) => h.code)),
    canSeeFinance: user.role !== "encarregado",
    canRegister: true,
    canAckAlerts: true,
    canResolveAlerts: user.role !== "encarregado",
    canConfigure: user.role !== "encarregado",
    canSeeUsers: user.role === "diretor",
    canDemo: user.role === "diretor",
    canEditDecisions: user.role !== "encarregado",
  };
}

export class PermissionError extends Error {
  status = 403;
  constructor(message = "Você não tem permissão para esta ação.") {
    super(message);
  }
}

export function assertHouse(scope: Scope, houseCode: string) {
  if (!scope.houseCodes.has(houseCode)) throw new PermissionError(`Sem acesso a ${houseCode}.`);
}

export function assertFinance(scope: Scope) {
  if (!scope.canSeeFinance) throw new PermissionError("O perfil encarregado não tem acesso aos dados financeiros.");
}

/** Filtra uma lista de códigos de galpão pelo escopo, devolvendo também avisos "sem acesso a P00X". */
export function filterHouses(scope: Scope, codes: string[]): { allowed: string[]; warnings: string[] } {
  const allowed: string[] = [];
  const warnings: string[] = [];
  for (const c of codes) {
    if (scope.houseCodes.has(c)) allowed.push(c);
    else warnings.push(`sem acesso a ${c}`);
  }
  return { allowed, warnings };
}
