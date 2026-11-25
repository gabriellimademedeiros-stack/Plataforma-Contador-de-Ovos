import Link from "next/link";
import { houseColor } from "@/lib/colors";
import { fmtNumber } from "@/lib/format";
import type { HeatRow } from "@/server/services/home";
import { STATUS_BG, STATUS_LABEL } from "./status";

export function HouseHeatmap({ rows, columns }: { rows: HeatRow[]; columns: Array<{ key: string; label: string; unit: string; decimals: number }> }) {
  return (
    <div className="overflow-x-auto">
      <table className="table-sticky w-full border-separate border-spacing-1 text-sm">
        <thead>
          <tr>
            <th className="px-2 text-left text-xs font-medium text-muted-foreground">Galpão</th>
            {columns.map((c) => (
              <th key={c.key} className="px-1 text-center text-xs font-medium whitespace-nowrap text-muted-foreground">
                {c.label}
                <div className="font-normal">({c.unit})</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.house}>
              <td className="px-2 whitespace-nowrap">
                <Link href={`/galpoes/${r.house}`} className="flex items-center gap-2 font-medium hover:underline">
                  <span className="size-2.5 rounded-full" style={{ background: houseColor(r.house) }} />
                  {r.house}
                  <span className="text-xs font-normal text-muted-foreground">
                    {r.flock} · {r.ageWeek} sem
                  </span>
                </Link>
              </td>
              {r.cells.map((c, i) => (
                <td key={c.metric} className="p-0">
                  <Link
                    href={`/galpoes/${r.house}?aba=${c.tab}`}
                    title={`${columns[i].label}: ${STATUS_LABEL[c.status]}`}
                    className={`block rounded-md px-2 py-2 text-center tabular-nums transition-opacity hover:opacity-80 ${STATUS_BG[c.status]}`}
                  >
                    {c.value == null ? "—" : fmtNumber(c.value, columns[i].decimals)}
                  </Link>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
