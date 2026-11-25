import "server-only";
import { cache } from "react";
import { getSql } from "@/db/client";
import type { TargetDef } from "@/engine/standards/targets";
import { DEFAULT_TARGETS } from "@/engine/standards/targets";
import type { StrainStandardRow } from "@/engine/standards/strain";
import type { InternalStandardRow } from "@/engine/standards/internal";
import { StrainStandards } from "@/engine/standards/strain";
import { InternalStandards } from "@/engine/standards/internal";

const n = (v: unknown) => (v == null ? null : Number(v));

export const getTargets = cache(async (): Promise<TargetDef[]> => {
  const sql = getSql();
  const rows = await sql`select * from app.targets`;
  return rows.map((r) => ({
    metricCode: r.metric_code,
    label: DEFAULT_TARGETS.find((t) => t.metricCode === r.metric_code)?.label ?? r.metric_code,
    phase: r.phase,
    greenMin: n(r.green_min),
    greenMax: n(r.green_max),
    yellowMin: n(r.yellow_min),
    yellowMax: n(r.yellow_max),
  }));
});

export const getStrainStandards = cache(async (): Promise<StrainStandards> => {
  const sql = getSql();
  const rows = await sql`select s.code, ss.age_week, ss.metric_code, ss.value from app.strain_standards ss join app.strains s on s.id = ss.strain_id`;
  const list: StrainStandardRow[] = rows.map((r) => ({ strainCode: r.code, ageWeek: Number(r.age_week), metric: r.metric_code, value: Number(r.value) }));
  return new StrainStandards(list);
});

export const getInternalStandards = cache(async (): Promise<InternalStandards> => {
  const sql = getSql();
  const rows = await sql`select s.code, i.* from app.internal_standards i join app.strains s on s.id = i.strain_id`;
  const list: InternalStandardRow[] = rows.map((r) => ({
    strainCode: r.code,
    ageWeek: Number(r.age_week),
    metric: r.metric_code,
    nFlocks: Number(r.n_flocks),
    mean: n(r.mean),
    median: n(r.median),
    p25: n(r.p25),
    p75: n(r.p75),
    excludedWeeks: Number(r.excluded_weeks),
  }));
  return new InternalStandards(list);
});

export const getCostParams = cache(async () => {
  const sql = getSql();
  const rows = await sql`select key, value, unit, label_pt from app.cost_params order by key`;
  return rows.map((r) => ({ key: r.key as string, value: Number(r.value), unit: r.unit as string, label: r.label_pt as string }));
});
