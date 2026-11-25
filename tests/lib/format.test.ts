import { describe, expect, it } from "vitest";
import {
  fmtAge,
  fmtBRL,
  fmtDate,
  fmtDateTime,
  fmtEggsAndBoxes,
  fmtInt,
  fmtNumber,
  fmtPct,
  fmtPP,
  fmtSignedPct,
} from "@/lib/format";

describe("formatação pt-BR", () => {
  it("números com separador de milhar e vírgula decimal", () => {
    expect(fmtInt(1234567)).toBe("1.234.567");
    expect(fmtNumber(1234.5, 2)).toBe("1.234,50");
    expect(fmtNumber(-0.0001, 2)).toBe("0,00");
  });
  it("percentuais", () => {
    expect(fmtPct(85.43)).toBe("85,4%");
    expect(fmtPct(0.034, 3)).toBe("0,034%");
  });
  it("moeda", () => {
    expect(fmtBRL(1234.56)).toBe("R$ 1.234,56");
    expect(fmtBRL(-12.5)).toBe("−R$ 12,50");
  });
  it("pontos percentuais com sinal de menos tipográfico", () => {
    expect(fmtPP(-3.21)).toBe("−3,2 p.p.");
    expect(fmtPP(1)).toBe("+1,0 p.p.");
    expect(fmtPP(0.01)).toBe("0,0 p.p.");
    expect(fmtSignedPct(-10)).toBe("−10,0%");
  });
  it("valor ausente aparece como travessão", () => {
    expect(fmtPct(null)).toBe("—");
    expect(fmtNumber(Number.NaN)).toBe("—");
  });
  it("ovos e caixas lado a lado", () => {
    expect(fmtEggsAndBoxes(720000)).toBe("720.000 ovos (2.000 caixas)");
  });
  it("datas", () => {
    expect(fmtDate("2026-11-24")).toBe("24/11/2026");
    expect(fmtDateTime(new Date("2026-11-25T11:10:00Z"))).toBe("25/11/2026 08:10");
  });
  it("idade", () => {
    expect(fmtAge(366)).toBe("52 semanas (366 dias)");
  });
});
