/** Passo 3 da Parte 7.14: empresa, usuários, granja, galpões, linhagens e curvas, catálogos, custos, metas, dispositivos. */
import bcrypt from "bcryptjs";
import type postgres from "postgres";
import { DEFAULT_PHASE_BOUNDS } from "../../src/lib/dates";
import { HOUSE_COLORS } from "../../src/lib/colors";
import {
  FARM_ID,
  TENANT_ID,
  deviceIdFor,
  houseIdFor,
  strainIdFor,
  userIdFor,
  uuidFromName,
} from "../../src/lib/ids";
import { METRICS } from "../../src/engine/metrics/catalog";
import { EVENT_TYPES } from "../../src/engine/impacts/event-types";
import { RULES } from "../../src/engine/alerts/rules";
import { DEFAULT_TARGETS } from "../../src/engine/standards/targets";
import {
  ASSET_VALUE_PER_BIRD,
  COST_PARAMS,
  DEVICES,
  FARM,
  GUIDE_EDITION,
  HOUSES,
  STRAINS,
} from "../../src/simulator/config";
import { strainStandardTable } from "../../src/simulator/curves";
import { insertBatched } from "./db-write";

type Sql = ReturnType<typeof postgres>;

export const DEMO_USERS = [
  { email: "diretor@demo.local", name: "Diretoria (demo)", role: "diretor", houses: null as string[] | null },
  { email: "gerente@demo.local", name: "Gerência de Produção (demo)", role: "gerente", houses: null },
  { email: "encarregado@demo.local", name: "Encarregado (demo)", role: "encarregado", houses: ["P001", "P002", "P003", "P004"] },
];

export async function seedBase(sql: Sql, opts: { demoPassword: string; dStart: string }) {
  const counts: Record<string, number> = {};
  counts.tenants = await insertBatched(sql, "tenants", [{ id: TENANT_ID, name: FARM.tenantName }]);

  const hash = await bcrypt.hash(opts.demoPassword, 10);
  counts.users = await insertBatched(
    sql,
    "users",
    DEMO_USERS.map((u) => ({
      id: userIdFor(u.email),
      tenant_id: TENANT_ID,
      name: u.name,
      email: u.email,
      password_hash: hash,
      role: u.role,
      allowed_house_ids: u.houses ? u.houses.map(houseIdFor) : null,
      active: true,
    })),
  );

  counts.farms = await insertBatched(sql, "farms", [
    {
      id: FARM_ID,
      tenant_id: TENANT_ID,
      name: FARM.name,
      city: FARM.city,
      state: FARM.state,
      lat: FARM.lat,
      lon: FARM.lon,
      timezone: FARM.timezone,
      cutoff_hour: FARM.cutoffHour,
      week_start_dow: FARM.weekStartDow,
      phase_bounds: DEFAULT_PHASE_BOUNDS,
    },
  ]);

  counts.houses = await insertBatched(
    sql,
    "houses",
    HOUSES.map((h, i) => ({
      id: houseIdFor(h.code),
      tenant_id: TENANT_ID,
      farm_id: FARM_ID,
      code: h.code,
      name: `Aviário ${h.code.slice(1)}`,
      capacity: h.capacity,
      system_type: FARM.systemType,
      lanes: 2,
      cooling_delta_c: h.coolingDelta,
      color: HOUSE_COLORS[h.code],
      built_year: h.builtYear,
      asset_value_brl: h.capacity * ASSET_VALUE_PER_BIRD,
      sort_order: i + 1,
    })),
  );

  counts.strains = await insertBatched(
    sql,
    "strains",
    STRAINS.map((s) => ({
      id: strainIdFor(s.code),
      tenant_id: TENANT_ID,
      code: s.code,
      name: s.name,
      shell_color: s.shellColor,
      guide_edition: GUIDE_EDITION,
    })),
  );

  counts.strain_standards = await insertBatched(
    sql,
    "strain_standards",
    STRAINS.flatMap((s) =>
      strainStandardTable(s).map((r) => ({
        strain_id: strainIdFor(s.code),
        age_week: r.ageWeek,
        metric_code: r.metric,
        value: r.value,
      })),
    ),
  );

  counts.metric_catalog = await insertBatched(
    sql,
    "metric_catalog",
    METRICS.map((m) => ({
      code: m.code,
      name_pt: m.name,
      short_pt: m.short,
      unit: m.unit,
      direction: m.direction,
      aggregation: m.aggregation,
      decimals: m.decimals,
      group_pt: m.group,
      description_pt: m.description,
      has_strain_standard: m.hasStrainStandard ?? false,
    })),
  );

  counts.alert_rules = await insertBatched(
    sql,
    "alert_rules",
    RULES.map((r) => ({
      code: r.code,
      name_pt: r.name,
      description_pt: r.description,
      anomaly_type: r.anomalyType,
      severity_default: r.severity,
      params: r.params,
      active: true,
      version: 1,
      kind: r.kind,
    })),
  );

  counts.event_types = await insertBatched(
    sql,
    "event_types",
    EVENT_TYPES.map((t) => ({
      code: t.code,
      category: t.category,
      name_pt: t.name,
      base_days: t.baseDays,
      effect_days: t.effectDays,
      effect_plus_duration: t.effectPlusDuration ?? false,
      recovery_days: t.recoveryDays,
      fields_schema: t.fields,
      icon: t.icon,
    })),
  );

  counts.cost_params = await insertBatched(
    sql,
    "cost_params",
    COST_PARAMS.map((c) => ({ tenant_id: TENANT_ID, key: c.key, value: c.value, unit: c.unit, label_pt: c.label })),
  );

  counts.targets = await insertBatched(
    sql,
    "targets",
    DEFAULT_TARGETS.map((t) => ({
      id: uuidFromName(`target:${t.metricCode}:${t.phase ?? "all"}`),
      tenant_id: TENANT_ID,
      metric_code: t.metricCode,
      phase: t.phase,
      green_min: t.greenMin,
      green_max: t.greenMax,
      yellow_min: t.yellowMin,
      yellow_max: t.yellowMax,
    })),
  );

  const devices: Record<string, unknown>[] = [];
  const assignments: Record<string, unknown>[] = [];
  HOUSES.forEach((h, i) => {
    const n = String(i + 1).padStart(4, "0");
    const cnt = `CNT-${n}`;
    const gtw = `GTW-${n}`;
    devices.push({
      id: deviceIdFor(cnt),
      tenant_id: TENANT_ID,
      code: cnt,
      type: "contador",
      model_version: DEVICES.counterModel,
      firmware: DEVICES.counterFirmware,
      status: "simulado",
      last_seen_at: null,
      confidence_score: DEVICES.confidence,
    });
    devices.push({
      id: deviceIdFor(gtw),
      tenant_id: TENANT_ID,
      code: gtw,
      type: "gateway",
      model_version: null,
      firmware: DEVICES.gatewayFirmware,
      status: "simulado",
      last_seen_at: null,
      confidence_score: null,
    });
    for (const code of [cnt, gtw]) {
      assignments.push({
        id: uuidFromName(`assign:${code}`),
        device_id: deviceIdFor(code),
        house_id: houseIdFor(h.code),
        lane: null,
        valid_from: opts.dStart,
        valid_to: null,
      });
    }
  });
  counts.devices = await insertBatched(sql, "devices", devices);
  counts.device_assignments = await insertBatched(sql, "device_assignments", assignments);
  return counts;
}
