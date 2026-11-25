import { describe, expect, it } from "vitest";
import { assertFinance, assertHouse, filterHouses, PermissionError, scopeForUser } from "@/server/permissions";
import { houseIdFor } from "@/lib/ids";

const houses = ["P001", "P002", "P003", "P004", "P005", "P006", "P007", "P008"].map((code) => ({ id: houseIdFor(code), code }));
const enc = scopeForUser({ id: "u3", email: "encarregado@demo.local", name: "Enc", role: "encarregado", allowedHouseIds: ["P001", "P002", "P003", "P004"].map(houseIdFor) }, houses);
const dir = scopeForUser({ id: "u1", email: "diretor@demo.local", name: "Dir", role: "diretor", allowedHouseIds: null }, houses);
const ger = scopeForUser({ id: "u2", email: "gerente@demo.local", name: "Ger", role: "gerente", allowedHouseIds: null }, houses);

describe("scopeForUser (Parte 17.3)", () => {
  it("encarregado vê só P001 a P004 e não vê financeiro", () => {
    expect([...enc.houseCodes].sort()).toEqual(["P001", "P002", "P003", "P004"]);
    expect(enc.canSeeFinance).toBe(false);
    expect(enc.canResolveAlerts).toBe(false);
    expect(enc.canConfigure).toBe(false);
    expect(enc.canDemo).toBe(false);
    expect(enc.canAckAlerts).toBe(true);
    expect(enc.canRegister).toBe(true);
    expect(() => assertHouse(enc, "P005")).toThrow(PermissionError);
    expect(() => assertFinance(enc)).toThrow(/financeiro/);
  });
  it("diretor e gerente veem todos os galpões; só o diretor usa a demonstração e vê usuários", () => {
    expect(dir.houseCodes.size).toBe(8);
    expect(ger.houseCodes.size).toBe(8);
    expect(dir.canDemo).toBe(true);
    expect(ger.canDemo).toBe(false);
    expect(dir.canSeeUsers).toBe(true);
    expect(ger.canSeeUsers).toBe(false);
    expect(ger.canConfigure).toBe(true);
    expect(ger.canSeeFinance).toBe(true);
  });
  it("filtra galpões fora do acesso com aviso", () => {
    expect(filterHouses(enc, ["P001", "P007"])).toEqual({ allowed: ["P001"], warnings: ["sem acesso a P007"] });
  });
});
