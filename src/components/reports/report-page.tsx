/**
 * Desenha uma página do relatório (tela, impressão e slide do modo reunião).
 * `variant="print"`: tamanho fixo de A4 paisagem, cabeçalho com granja e semana, rodapé "Dados simulados · página X de N".
 */
import { EChart } from "@/components/charts/echart";
import { cn } from "@/lib/utils";
import type { RBlock, ReportModel, RPage, RRow, Tone } from "./types";

const toneCls = (t: Tone | undefined) =>
  t === "good" ? "text-emerald-700" : t === "bad" ? "text-red-700" : t === "warn" ? "text-amber-700" : t === "muted" ? "text-slate-400" : "";
const toneBg = (t: Tone | undefined) =>
  t === "good" ? "bg-emerald-50" : t === "bad" ? "bg-red-50" : t === "warn" ? "bg-amber-50" : "";

function Block({ b, dense }: { b: RBlock; dense: boolean }) {
  switch (b.type) {
    case "kpis":
      return (
        <div className={cn("grid gap-2", b.items.length >= 5 ? "grid-cols-5" : b.items.length === 4 ? "grid-cols-4" : "grid-cols-3")}>
          {b.items.map((k) => (
            <div key={k.label} className="rounded-lg border bg-white p-2">
              <div className="text-[11px] text-slate-500">{k.label}</div>
              <div className={cn("font-semibold tabular-nums", dense ? "text-lg" : "text-xl")}>{k.value}</div>
              {k.lines?.map((l, i) => (
                <div key={i} className={cn("text-[11px] tabular-nums", toneCls(l.tone) || "text-slate-600")}>
                  {l.text}
                </div>
              ))}
            </div>
          ))}
        </div>
      );
    case "text":
      return (
        <div className={cn(b.style === "callout" && "rounded-lg border-l-4 border-emerald-600 bg-emerald-50/60 p-2")}>
          {b.title && <div className="mb-1 text-[13px] font-semibold">{b.title}</div>}
          {b.style === "plain" || b.style === "callout" ? (
            b.lines.map((l, i) => (
              <p key={i} className={cn(dense ? "text-[11px]" : "text-sm", "leading-snug")}>
                {l}
              </p>
            ))
          ) : (
            <ol className={cn(b.style === "numbered" ? "list-decimal" : "list-disc", "space-y-0.5 pl-5", dense ? "text-[11px]" : "text-sm")}>
              {b.lines.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ol>
          )}
        </div>
      );
    case "table":
      return (
        <div>
          {b.title && <div className="mb-1 text-[13px] font-semibold">{b.title}</div>}
          {b.rows.length === 0 ? (
            <p className="text-xs text-slate-500">{b.empty ?? "Sem dados."}</p>
          ) : (
            <table className={cn("w-full border-collapse", dense ? "text-[10px]" : "text-xs")}>
              <thead>
                <tr>
                  {b.columns.map((c, i) => (
                    <th key={i} className={cn("border-b-2 border-slate-300 px-1.5 py-1 font-semibold whitespace-nowrap", (b.align?.[i] ?? (i === 0 ? "l" : "r")) === "l" ? "text-left" : b.align?.[i] === "c" ? "text-center" : "text-right")}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {b.rows.map((r: RRow, ri) =>
                  "group" in r ? (
                    <tr key={ri}>
                      <td colSpan={b.columns.length} className="bg-slate-100 px-1.5 py-0.5 font-semibold">
                        {r.group}
                      </td>
                    </tr>
                  ) : (
                    <tr key={ri} className="border-b border-slate-100">
                      {r.map((c, ci) => (
                        <td key={ci} className={cn("px-1.5 py-[3px] tabular-nums", (b.align?.[ci] ?? (ci === 0 ? "l" : "r")) === "l" ? "text-left" : b.align?.[ci] === "c" ? "text-center" : "text-right", toneCls(c.tone), toneBg(c.tone), c.bold && "font-semibold")}>
                          {c.v}
                        </td>
                      ))}
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          )}
          {b.note && <p className="mt-1 text-[10px] text-slate-500">{b.note}</p>}
        </div>
      );
    case "chart":
      return (
        <div className="rounded border bg-white p-1">
          <EChart spec={b.spec} height={b.height ?? 220} hideToolbar />
        </div>
      );
    case "grid":
      return (
        <div className={cn("grid gap-3", b.cols === 3 ? "grid-cols-3" : "grid-cols-2")}>
          {b.blocks.map((x, i) => (
            <Block key={i} b={x} dense={dense} />
          ))}
        </div>
      );
    case "items":
      return (
        <div>
          {b.title && <div className="mb-1 text-[13px] font-semibold">{b.title}</div>}
          {b.items.length === 0 && <p className="text-xs text-slate-500">{b.empty ?? "Nada a destacar."}</p>}
          <div className="space-y-1.5">
            {b.items.map((it, i) => (
              <div key={i} className={cn("rounded border-l-4 bg-white p-1.5", it.tone === "bad" ? "border-red-500" : it.tone === "warn" ? "border-amber-500" : it.tone === "good" ? "border-emerald-500" : "border-slate-300")}>
                <div className={cn("font-semibold", dense ? "text-[11px]" : "text-sm")}>
                  {it.head} {it.tag && <span className="ml-1 rounded bg-slate-100 px-1 text-[10px] font-normal text-slate-600">{it.tag}</span>}
                </div>
                {it.lines.map((l, j) => (
                  <div key={j} className={cn("text-slate-700", dense ? "text-[10.5px]" : "text-xs")}>
                    {l}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      );
  }
}

export function ReportPageView({ page, model, variant = "web" }: { page: RPage; model: ReportModel; variant?: "web" | "print" | "slide" }) {
  const fixed = variant !== "web";
  return (
    <section
      className={cn(
        "report-page relative flex flex-col bg-white",
        fixed ? "h-[186mm] w-[273mm] overflow-hidden p-0" : "rounded-xl border p-4 shadow-sm",
        variant === "slide" && "p-[6mm] h-[198mm] w-[285mm]",
      )}
      data-page={page.n}
    >
      {fixed && (
        <header className="mb-2 flex items-baseline justify-between border-b pb-1 text-[10px] text-slate-500">
          <span>
            {model.farmName} · {model.title}
          </span>
          <span>{model.weekLabel}</span>
        </header>
      )}
      <div className="mb-2 flex flex-wrap items-baseline gap-2">
        <h2 className={cn("font-semibold tracking-tight", fixed ? "text-[17px]" : "text-lg")}>
          {page.n}. {page.title}
        </h2>
        {page.subtitle && <span className="text-xs text-slate-500">{page.subtitle}</span>}
        {page.badges?.map((b) => (
          <span key={b} className="rounded border border-amber-300 bg-amber-50 px-1.5 text-[10px] font-medium text-amber-800">
            {b}
          </span>
        ))}
      </div>
      <div className={cn("flex min-h-0 flex-1 flex-col", fixed ? "gap-2" : "gap-3")}>
        {page.blocks.map((b, i) => (
          <Block key={i} b={b} dense={fixed} />
        ))}
      </div>
      {fixed && (
        <footer className="mt-1 flex justify-between border-t pt-1 text-[9px] text-slate-500">
          <span>Gerado em {new Date(model.generatedAt).toLocaleString("pt-BR", { timeZone: "America/Fortaleza", dateStyle: "short", timeStyle: "short" })} · dados até {model.refDate.split("-").reverse().join("/")}</span>
          <span>
            Dados simulados · página {page.n} de {model.pages.length}
          </span>
        </footer>
      )}
    </section>
  );
}
