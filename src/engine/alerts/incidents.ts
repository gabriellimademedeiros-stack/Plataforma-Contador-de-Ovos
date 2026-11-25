/** Incidentes (Parte 10.4): agrupamento de alertas do mesmo problema. */
import { diffDays } from "@/lib/dates";
import { uuidFromName } from "@/lib/ids";
import type { EngineAlert } from "./engine";

export interface Incident {
  id: string;
  scope: "galpao" | "granja";
  house: string | null;
  title: string;
  openedOn: string;
  alertIds: string[];
}

export function groupIncidents(alerts: EngineAlert[]): { incidents: Incident[]; alertIncident: Map<string, string> } {
  const sorted = [...alerts].filter((a) => a.rule !== "P01").sort((a, b) => (a.openedOn < b.openedOn ? -1 : a.openedOn > b.openedOn ? 1 : 0));
  const incidents: Incident[] = [];
  const alertIncident = new Map<string, string>();
  // 1) mesma regra em 3 ou mais galpões no mesmo dia ou em dias consecutivos → incidente de granja
  const byRule = new Map<string, EngineAlert[]>();
  for (const a of sorted) {
    const arr = byRule.get(a.rule) ?? [];
    arr.push(a);
    byRule.set(a.rule, arr);
  }
  for (const [, list] of byRule) {
    let cluster: EngineAlert[] = [];
    const flush = () => {
      const houses = new Set(cluster.map((x) => x.house));
      if (houses.size >= 3) {
        const first = cluster[0];
        const inc: Incident = {
          id: uuidFromName(`incident:farm:${first.id}`),
          scope: "granja",
          house: null,
          title: `${first.title} e mais ${cluster.length - 1} — possível causa comum em ${houses.size} galpões`,
          openedOn: first.openedOn,
          alertIds: cluster.map((x) => x.id),
        };
        incidents.push(inc);
        for (const x of cluster) alertIncident.set(x.id, inc.id);
      }
      cluster = [];
    };
    for (const a of list) {
      if (cluster.length && diffDays(cluster[cluster.length - 1].openedOn, a.openedOn) > 1) flush();
      cluster.push(a);
    }
    flush();
  }
  // 2) alertas do mesmo galpão com até 3 dias desde o último alerta do incidente → incidente do galpão
  const open = new Map<string, Incident & { last: string }>();
  for (const a of sorted) {
    if (alertIncident.has(a.id) || !a.house) continue;
    const cur = open.get(a.house);
    if (cur && diffDays(cur.last, a.openedOn) <= 3) {
      cur.alertIds.push(a.id);
      cur.last = a.openedOn;
      continue;
    }
    const inc = { id: uuidFromName(`incident:house:${a.id}`), scope: "galpao" as const, house: a.house, title: a.title, openedOn: a.openedOn, alertIds: [a.id], last: a.openedOn };
    open.set(a.house, inc);
    incidents.push(inc);
  }
  const result = incidents.filter((i) => i.alertIds.length >= 2 || i.scope === "granja");
  for (const i of result) {
    if (i.scope === "galpao") {
      const first = sorted.find((a) => a.id === i.alertIds[0])!;
      i.title = `${first.title} e mais ${i.alertIds.length - 1}`;
    }
    for (const id of i.alertIds) alertIncident.set(id, i.id);
  }
  return { incidents: result.map(({ ...i }) => { delete (i as { last?: string }).last; return i; }), alertIncident };
}
