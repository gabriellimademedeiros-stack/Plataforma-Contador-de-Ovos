/** CSV para Excel em português: separador ";", UTF-8 com BOM (adicionado no download), vírgula decimal, datas dd/mm/aaaa. */
import type { ChartSpec } from "./types";

export function csvCell(v: unknown): string {
  if (v == null || (typeof v === "number" && !Number.isFinite(v))) return "";
  if (typeof v === "number") return String(v).replace(".", ",");
  let s = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s = `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
  else if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    const d = new Date(s);
    s = d.toLocaleString("pt-BR", { timeZone: "America/Fortaleza" }).replace(",", "");
  }
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  return [header.map(csvCell).join(";"), ...rows.map((r) => r.map(csvCell).join(";"))].join("\r\n");
}

export function specToCsv(spec: ChartSpec): string {
  if (spec.kind === "heatmap" && spec.heat) {
    const h = spec.heat;
    const rows = h.y.map((y, yi) => [y, ...h.x.map((_, xi) => h.values.find((v) => v[0] === xi && v[1] === yi)?.[2] ?? null)]);
    return toCsv(["", ...h.x], rows);
  }
  const xs = Array.from(new Set(spec.series.flatMap((s) => s.data.map((d) => d[0])))).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const header = [spec.xLabel ?? (spec.kind === "age" ? "Semana de idade" : "Data"), ...spec.series.map((s) => s.name), ...(spec.bands ?? []).flatMap((b) => [`${b.name} (inferior)`, `${b.name} (superior)`])];
  const maps = spec.series.map((s) => new Map(s.data.map((d) => [d[0], d[1]])));
  const bandMaps = (spec.bands ?? []).flatMap((b) => [new Map(b.lower.map((d) => [d[0], d[1]])), new Map(b.upper.map((d) => [d[0], d[1]]))]);
  return toCsv(header, xs.map((x) => [x, ...maps.map((m) => m.get(x) ?? null), ...bandMaps.map((m) => m.get(x) ?? null)]));
}
