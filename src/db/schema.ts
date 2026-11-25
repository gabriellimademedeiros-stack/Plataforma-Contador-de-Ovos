/**
 * Schema do banco (Parte 5 da especificação). Todas as tabelas ficam no schema `app`,
 * que não é exposto pela API pública do Supabase. RLS é habilitado em todas (migração custom).
 */
import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const app = pgSchema("app");

const id = () => uuid("id").primaryKey().defaultRandom();
const tenantId = () => uuid("tenant_id").notNull();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const inList = (col: string, values: string[]) =>
  sql.raw(`${col} in (${values.map((v) => `'${v}'`).join(", ")})`);

// ---------------------------------------------------------------------------
// 5.1 Identidade e estrutura
// ---------------------------------------------------------------------------

export const tenants = app.table("tenants", {
  id: id(),
  name: text("name").notNull(),
  createdAt: createdAt(),
});

export const users = app.table(
  "users",
  {
    id: id(),
    tenantId: tenantId(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    role: text("role").notNull(),
    allowedHouseIds: uuid("allowed_house_ids").array(),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  () => [check("users_role_check", inList("role", ["diretor", "gerente", "encarregado"]))],
);

export const loginAttempts = app.table(
  "login_attempts",
  {
    id: id(),
    email: text("email").notNull(),
    ip: text("ip"),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    success: boolean("success").notNull(),
  },
  (t) => [index("login_attempts_email_at_idx").on(t.email, t.at)],
);

export const farms = app.table("farms", {
  id: id(),
  tenantId: tenantId(),
  name: text("name").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
  lat: doublePrecision("lat"),
  lon: doublePrecision("lon"),
  timezone: text("timezone").notNull().default("America/Fortaleza"),
  cutoffHour: smallint("cutoff_hour").notNull().default(6),
  weekStartDow: smallint("week_start_dow").notNull().default(0),
  phaseBounds: jsonb("phase_bounds").notNull(),
  createdAt: createdAt(),
});

export const houses = app.table(
  "houses",
  {
    id: id(),
    tenantId: tenantId(),
    farmId: uuid("farm_id").notNull(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    capacity: integer("capacity").notNull(),
    systemType: text("system_type").notNull(),
    lanes: smallint("lanes").notNull().default(2),
    coolingDeltaC: doublePrecision("cooling_delta_c").notNull(),
    color: text("color").notNull(),
    builtYear: integer("built_year"),
    assetValueBrl: doublePrecision("asset_value_brl"),
    sortOrder: integer("sort_order").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("houses_farm_code_uq").on(t.farmId, t.code)],
);

export const devices = app.table(
  "devices",
  {
    id: id(),
    tenantId: tenantId(),
    code: text("code").notNull().unique(),
    type: text("type").notNull(),
    modelVersion: text("model_version"),
    firmware: text("firmware"),
    status: text("status").notNull().default("simulado"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    confidenceScore: doublePrecision("confidence_score"),
    createdAt: createdAt(),
  },
  () => [
    check("devices_type_check", inList("type", ["contador", "gateway"])),
    check("devices_status_check", inList("status", ["online", "offline", "simulado"])),
  ],
);

export const deviceAssignments = app.table("device_assignments", {
  id: id(),
  deviceId: uuid("device_id").notNull(),
  houseId: uuid("house_id").notNull(),
  lane: smallint("lane"),
  validFrom: date("valid_from").notNull(),
  validTo: date("valid_to"),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// 5.2 Lotes e linhagens
// ---------------------------------------------------------------------------

export const strains = app.table(
  "strains",
  {
    id: id(),
    tenantId: tenantId(),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    shellColor: text("shell_color").notNull(),
    guideEdition: text("guide_edition").notNull(),
    createdAt: createdAt(),
  },
  () => [check("strains_shell_check", inList("shell_color", ["branco", "vermelho"]))],
);

export const strainStandards = app.table(
  "strain_standards",
  {
    strainId: uuid("strain_id").notNull(),
    ageWeek: smallint("age_week").notNull(),
    metricCode: text("metric_code").notNull(),
    value: doublePrecision("value").notNull(),
  },
  (t) => [primaryKey({ columns: [t.strainId, t.ageWeek, t.metricCode] })],
);

export const flocks = app.table(
  "flocks",
  {
    id: id(),
    tenantId: tenantId(),
    code: text("code").notNull().unique(),
    strainId: uuid("strain_id").notNull(),
    hatchDate: date("hatch_date").notNull(),
    birdsHoused: integer("birds_housed").notNull(),
    chickCostBrl: doublePrecision("chick_cost_brl").notNull(),
    plannedCullAgeWeeks: smallint("planned_cull_age_weeks").notNull(),
    status: text("status").notNull(),
    /** Só para o simulador; nunca exibir. */
    qualityOffsetPp: doublePrecision("quality_offset_pp").notNull().default(0),
    createdAt: createdAt(),
  },
  () => [check("flocks_status_check", inList("status", ["ativo", "encerrado"]))],
);

export const flockPlacements = app.table(
  "flock_placements",
  {
    id: id(),
    flockId: uuid("flock_id").notNull(),
    houseId: uuid("house_id").notNull(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date"),
    birdsIn: integer("birds_in").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("flock_placements_house_idx").on(t.houseId, t.startDate)],
);

export const flockMovements = app.table(
  "flock_movements",
  {
    id: id(),
    flockId: uuid("flock_id").notNull(),
    houseId: uuid("house_id").notNull(),
    date: date("date").notNull(),
    type: text("type").notNull(),
    qty: integer("qty").notNull(),
    createdAt: createdAt(),
  },
  () => [
    check(
      "flock_movements_type_check",
      inList("type", ["alojamento", "descarte_final", "descarte_parcial", "transferencia"]),
    ),
  ],
);

// ---------------------------------------------------------------------------
// 5.3 Dados brutos
// ---------------------------------------------------------------------------

export const EGG_CLASSES = ["clean", "dirty_feces", "dirty_blood", "cracked", "broken", "undetermined"] as const;

export const eggCounts = app.table(
  "egg_counts",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tenantId: tenantId(),
    houseId: uuid("house_id").notNull(),
    deviceId: uuid("device_id"),
    date: date("date").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    windowMinutes: smallint("window_minutes").notNull(),
    lane: smallint("lane").notNull(),
    eggClass: text("egg_class").notNull(),
    qty: integer("qty").notNull(),
    meanConf: real("mean_conf"),
    modelVersion: text("model_version"),
    messageId: text("message_id"),
    qualityFlag: smallint("quality_flag").notNull().default(0),
    source: text("source").notNull().default("simulado"),
  },
  (t) => [
    uniqueIndex("egg_counts_uq").on(t.houseId, t.windowStart, t.windowMinutes, t.lane, t.eggClass),
    index("egg_counts_house_date_idx").on(t.houseId, t.date),
    index("egg_counts_message_idx").on(t.messageId),
    check("egg_counts_class_check", inList("egg_class", [...EGG_CLASSES])),
    check("egg_counts_window_check", sql`window_minutes in (1440, 60, 1)`),
    check("egg_counts_source_check", inList("source", ["simulado", "ao_vivo"])),
  ],
);

export const dailyRecords = app.table(
  "daily_records",
  {
    id: id(),
    tenantId: tenantId(),
    houseId: uuid("house_id").notNull(),
    flockId: uuid("flock_id").notNull(),
    date: date("date").notNull(),
    birdsStart: integer("birds_start").notNull(),
    deaths: integer("deaths").notNull(),
    deathsByCause: jsonb("deaths_by_cause").notNull().default({}),
    culls: integer("culls").notNull().default(0),
    feedKg: doublePrecision("feed_kg"),
    waterL: doublePrecision("water_l"),
    eggWeightG: doublePrecision("egg_weight_g"),
    lightHours: doublePrecision("light_hours"),
    feedBatchId: uuid("feed_batch_id"),
    source: text("source").notNull().default("simulado"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("daily_records_house_date_uq").on(t.houseId, t.date)],
);

export const dailyEnv = app.table(
  "daily_env",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    /** null = clima externo */
    houseId: uuid("house_id"),
    date: date("date").notNull(),
    tempMax: doublePrecision("temp_max"),
    tempMin: doublePrecision("temp_min"),
    tempMean: doublePrecision("temp_mean"),
    rhMean: doublePrecision("rh_mean"),
    hoursAbove30: doublePrecision("hours_above_30"),
    hoursAbove32: doublePrecision("hours_above_32"),
    degreeHours30: doublePrecision("degree_hours_30"),
    nh3Max: doublePrecision("nh3_max"),
    nightMax: doublePrecision("night_max"),
  },
  (t) => [
    uniqueIndex("daily_env_house_date_uq").on(
      sql`coalesce(${t.houseId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
      t.date,
    ),
    index("daily_env_date_idx").on(t.date),
  ],
);

export const sensorReadings = app.table(
  "sensor_readings",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tenantId: tenantId(),
    houseId: uuid("house_id"),
    ts: timestamp("ts", { withTimezone: true }).notNull(),
    metricCode: text("metric_code").notNull(),
    value: doublePrecision("value").notNull(),
    qualityFlag: smallint("quality_flag").notNull().default(0),
    source: text("source").notNull().default("simulado"),
  },
  (t) => [index("sensor_readings_house_metric_ts_idx").on(t.houseId, t.metricCode, t.ts)],
);

export const weatherForecast = app.table(
  "weather_forecast",
  {
    farmId: uuid("farm_id").notNull(),
    date: date("date").notNull(),
    tempMax: doublePrecision("temp_max").notNull(),
    tempMin: doublePrecision("temp_min").notNull(),
    generatedOn: date("generated_on").notNull(),
  },
  (t) => [primaryKey({ columns: [t.farmId, t.date] })],
);

export const feedBatches = app.table("feed_batches", {
  id: id(),
  tenantId: tenantId(),
  code: text("code").notNull().unique(),
  deliveredOn: date("delivered_on").notNull(),
  supplier: text("supplier").notNull(),
  formulation: text("formulation").notNull(),
  houseIds: uuid("house_ids").array().notNull(),
  pricePerKg: doublePrecision("price_per_kg").notNull(),
  calciumPctSpec: doublePrecision("calcium_pct_spec").notNull(),
  labNote: text("lab_note"),
  createdAt: createdAt(),
});

export const bodyWeightSamples = app.table(
  "body_weight_samples",
  {
    id: id(),
    houseId: uuid("house_id").notNull(),
    flockId: uuid("flock_id").notNull(),
    date: date("date").notNull(),
    n: integer("n").notNull(),
    meanG: doublePrecision("mean_g").notNull(),
    cvPct: doublePrecision("cv_pct").notNull(),
    uniformityPct: doublePrecision("uniformity_pct").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("body_weight_house_date_idx").on(t.houseId, t.date)],
);

export const labSamples = app.table(
  "lab_samples",
  {
    id: id(),
    tenantId: tenantId(),
    houseId: uuid("house_id").notNull(),
    flockId: uuid("flock_id").notNull(),
    date: date("date").notNull(),
    type: text("type").notNull().default("casca"),
    nEggs: integer("n_eggs").notNull(),
    strengthKgf: doublePrecision("strength_kgf"),
    thicknessMm: doublePrecision("thickness_mm"),
    specificGravity: doublePrecision("specific_gravity"),
    haugh: doublePrecision("haugh"),
    eggWeightG: doublePrecision("egg_weight_g"),
    yolkColor: doublePrecision("yolk_color"),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [index("lab_samples_house_date_idx").on(t.houseId, t.date)],
);

export const shelfLifeTests = app.table("shelf_life_tests", {
  id: id(),
  tenantId: tenantId(),
  houseId: uuid("house_id").notNull(),
  flockId: uuid("flock_id").notNull(),
  startDate: date("start_date").notNull(),
  storageTempC: doublePrecision("storage_temp_c").notNull(),
  storageRhPct: doublePrecision("storage_rh_pct").notNull(),
  scheduleDays: integer("schedule_days").array().notNull(),
  createdAt: createdAt(),
});

export const shelfLifeMeasurements = app.table("shelf_life_measurements", {
  id: id(),
  testId: uuid("test_id").notNull(),
  day: integer("day").notNull(),
  n: integer("n").notNull(),
  haughMean: doublePrecision("haugh_mean").notNull(),
  weightLossPct: doublePrecision("weight_loss_pct").notNull(),
  airCellMm: doublePrecision("air_cell_mm").notNull(),
  createdAt: createdAt(),
});

export const prices = app.table(
  "prices",
  {
    tenantId: tenantId(),
    weekStart: date("week_start").notNull(),
    item: text("item").notNull(),
    valueBrl: doublePrecision("value_brl").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.weekStart, t.item] }),
    check(
      "prices_item_check",
      inList("item", ["ovo_comercial_dz", "ovo_trincado_dz", "ovo_sujo_dz", "racao_kg", "ave_descarte_un"]),
    ),
  ],
);

export const costParams = app.table(
  "cost_params",
  {
    tenantId: tenantId(),
    key: text("key").notNull(),
    value: doublePrecision("value").notNull(),
    unit: text("unit").notNull(),
    labelPt: text("label_pt").notNull(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.key] })],
);

export const targets = app.table("targets", {
  id: id(),
  tenantId: tenantId(),
  metricCode: text("metric_code").notNull(),
  phase: text("phase"),
  greenMin: doublePrecision("green_min"),
  greenMax: doublePrecision("green_max"),
  yellowMin: doublePrecision("yellow_min"),
  yellowMax: doublePrecision("yellow_max"),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// 5.4 Indicadores e padrões calculados
// ---------------------------------------------------------------------------

export const metricCatalog = app.table(
  "metric_catalog",
  {
    code: text("code").primaryKey(),
    namePt: text("name_pt").notNull(),
    shortPt: text("short_pt").notNull(),
    unit: text("unit").notNull(),
    direction: text("direction").notNull(),
    aggregation: text("aggregation").notNull(),
    decimals: smallint("decimals").notNull(),
    groupPt: text("group_pt").notNull(),
    descriptionPt: text("description_pt").notNull(),
    hasStrainStandard: boolean("has_strain_standard").notNull().default(false),
  },
  () => [
    check("metric_direction_check", inList("direction", ["maior_melhor", "menor_melhor", "neutro"])),
    check(
      "metric_aggregation_check",
      inList("aggregation", ["soma", "razao", "media_ponderada", "ultimo", "max", "min"]),
    ),
  ],
);

const metricValueCols = () => ({
  metricCode: text("metric_code").notNull(),
  value: doublePrecision("value"),
  numerator: doublePrecision("numerator"),
  denominator: doublePrecision("denominator"),
});

export const dailyMetrics = app.table(
  "daily_metrics",
  {
    tenantId: tenantId(),
    houseId: uuid("house_id").notNull(),
    flockId: uuid("flock_id").notNull(),
    date: date("date").notNull(),
    ageDays: integer("age_days").notNull(),
    ageWeek: smallint("age_week").notNull(),
    phase: text("phase").notNull(),
    ...metricValueCols(),
    qualityFlag: smallint("quality_flag").notNull().default(0),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.houseId, t.date, t.metricCode] }),
    index("daily_metrics_house_metric_date_idx").on(t.houseId, t.metricCode, t.date),
    index("daily_metrics_metric_date_idx").on(t.metricCode, t.date),
  ],
);

export const weeklyMetrics = app.table(
  "weekly_metrics",
  {
    tenantId: tenantId(),
    houseId: uuid("house_id").notNull(),
    flockId: uuid("flock_id").notNull(),
    weekStart: date("week_start").notNull(),
    ageWeek: smallint("age_week").notNull(),
    phase: text("phase").notNull(),
    ...metricValueCols(),
    daysCount: smallint("days_count").notNull(),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.houseId, t.weekStart, t.metricCode] }),
    index("weekly_metrics_house_metric_week_idx").on(t.houseId, t.metricCode, t.weekStart),
  ],
);

export const farmDailyMetrics = app.table(
  "farm_daily_metrics",
  {
    tenantId: tenantId(),
    date: date("date").notNull(),
    ...metricValueCols(),
    qualityFlag: smallint("quality_flag").notNull().default(0),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.date, t.metricCode] })],
);

export const farmWeeklyMetrics = app.table(
  "farm_weekly_metrics",
  {
    tenantId: tenantId(),
    weekStart: date("week_start").notNull(),
    ...metricValueCols(),
    daysCount: smallint("days_count").notNull(),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.weekStart, t.metricCode] })],
);

export const internalStandards = app.table(
  "internal_standards",
  {
    strainId: uuid("strain_id").notNull(),
    ageWeek: smallint("age_week").notNull(),
    metricCode: text("metric_code").notNull(),
    nFlocks: integer("n_flocks").notNull(),
    mean: doublePrecision("mean"),
    median: doublePrecision("median"),
    p25: doublePrecision("p25"),
    p75: doublePrecision("p75"),
    excludedWeeks: integer("excluded_weeks").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.strainId, t.ageWeek, t.metricCode] })],
);

// ---------------------------------------------------------------------------
// 5.5 Eventos
// ---------------------------------------------------------------------------

export const EVENT_CATEGORIES = ["sanitario", "manejo", "ambiente", "estrutura", "detectado", "outro"] as const;

export const eventTypes = app.table(
  "event_types",
  {
    code: text("code").primaryKey(),
    category: text("category").notNull(),
    namePt: text("name_pt").notNull(),
    baseDays: integer("base_days").notNull(),
    effectDays: integer("effect_days").notNull(),
    /** onda de calor: efeito = duração + 7 */
    effectPlusDuration: boolean("effect_plus_duration").notNull().default(false),
    recoveryDays: integer("recovery_days").notNull(),
    fieldsSchema: jsonb("fields_schema").notNull().default([]),
    icon: text("icon").notNull(),
  },
  () => [check("event_types_category_check", inList("category", [...EVENT_CATEGORIES]))],
);

export const events = app.table(
  "events",
  {
    id: id(),
    tenantId: tenantId(),
    typeCode: text("type_code").notNull(),
    title: text("title").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    severity: text("severity").notNull().default("media"),
    certainty: text("certainty").notNull().default("suspeito"),
    confirmedBy: text("confirmed_by"),
    description: text("description"),
    details: jsonb("details").notNull().default({}),
    actionTaken: text("action_taken"),
    costBrl: doublePrecision("cost_brl"),
    source: text("source").notNull().default("usuario"),
    createdBy: uuid("created_by"),
    createdAt: createdAt(),
    completeness: text("completeness").notNull().default("completo"),
  },
  (t) => [
    index("events_starts_at_idx").on(t.startsAt),
    check("events_severity_check", inList("severity", ["baixa", "media", "alta", "critica"])),
    check("events_certainty_check", inList("certainty", ["suspeito", "provavel", "confirmado", "descartado"])),
    check(
      "events_confirmed_by_check",
      sql`confirmed_by is null or confirmed_by in ('clinica', 'laboratorio', 'necropsia')`,
    ),
    check("events_source_check", inList("source", ["usuario", "plataforma", "simulado", "assistente"])),
    check("events_completeness_check", inList("completeness", ["completo", "incompleto"])),
  ],
);

export const eventScopes = app.table(
  "event_scopes",
  {
    eventId: uuid("event_id").notNull(),
    houseId: uuid("house_id").notNull(),
    flockId: uuid("flock_id"),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.houseId] }), index("event_scopes_house_idx").on(t.houseId)],
);

export const eventCertaintyHistory = app.table("event_certainty_history", {
  id: id(),
  eventId: uuid("event_id").notNull(),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  fromCertainty: text("from_certainty"),
  toCertainty: text("to_certainty").notNull(),
  byUser: uuid("by_user"),
  note: text("note"),
});

export const eventImpacts = app.table(
  "event_impacts",
  {
    eventId: uuid("event_id").notNull(),
    houseId: uuid("house_id").notNull(),
    metricCode: text("metric_code").notNull(),
    isControl: boolean("is_control").notNull().default(false),
    baseMean: doublePrecision("base_mean"),
    baseRobustSd: doublePrecision("base_robust_sd"),
    effectMean: doublePrecision("effect_mean"),
    deltaAbs: doublePrecision("delta_abs"),
    deltaPct: doublePrecision("delta_pct"),
    z: doublePrecision("z"),
    worstValue: doublePrecision("worst_value"),
    lagDays: integer("lag_days"),
    recoveryDays: integer("recovery_days"),
    lossEggs: doublePrecision("loss_eggs"),
    lossBrl: doublePrecision("loss_brl"),
    windowClosed: boolean("window_closed").notNull().default(false),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.houseId, t.metricCode] })],
);

export const eventFingerprints = app.table(
  "event_fingerprints",
  {
    eventId: uuid("event_id").notNull(),
    houseId: uuid("house_id").notNull(),
    vector: real("vector").array().notNull(),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.houseId] })],
);

export const eventLinks = app.table(
  "event_links",
  {
    eventId: uuid("event_id").notNull(),
    alertId: uuid("alert_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.alertId] })],
);

// ---------------------------------------------------------------------------
// 5.6 Alertas e operação
// ---------------------------------------------------------------------------

export const alertRules = app.table("alert_rules", {
  code: text("code").primaryKey(),
  namePt: text("name_pt").notNull(),
  descriptionPt: text("description_pt").notNull(),
  anomalyType: text("anomaly_type").notNull(),
  severityDefault: text("severity_default").notNull(),
  params: jsonb("params").notNull(),
  active: boolean("active").notNull().default(true),
  version: integer("version").notNull().default(1),
  kind: text("kind").notNull().default("diaria"),
});

export const ALERT_STATUSES = ["aberto", "reconhecido", "em_investigacao", "resolvido", "descartado"] as const;

export const alerts = app.table(
  "alerts",
  {
    id: id(),
    tenantId: tenantId(),
    ruleCode: text("rule_code").notNull(),
    houseId: uuid("house_id"),
    flockId: uuid("flock_id"),
    metricCode: text("metric_code"),
    anomalyType: text("anomaly_type").notNull(),
    firstDeviationOn: date("first_deviation_on").notNull(),
    openedOn: date("opened_on").notNull(),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull(),
    lastSeenOn: date("last_seen_on").notNull(),
    closedOn: date("closed_on"),
    status: text("status").notNull().default("aberto"),
    severity: text("severity").notNull(),
    title: text("title").notNull(),
    observed: jsonb("observed").notNull().default({}),
    evidence: jsonb("evidence").notNull().default({}),
    hypotheses: jsonb("hypotheses").notNull().default([]),
    decomposition: jsonb("decomposition"),
    similarCases: jsonb("similar_cases").notNull().default([]),
    incidentId: uuid("incident_id"),
    ackBy: uuid("ack_by"),
    ackAt: timestamp("ack_at", { withTimezone: true }),
    resolvedBy: uuid("resolved_by"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    causeCode: text("cause_code"),
    causeNote: text("cause_note"),
    actionTaken: text("action_taken"),
    wasUseful: boolean("was_useful"),
    discardReason: text("discard_reason"),
    reopenedCount: integer("reopened_count").notNull().default(0),
    /** "aceitar a nova condição por N dias" (Parte 10.3): regra silenciada no galpão até esta data. */
    silencedUntil: date("silenced_until"),
    source: text("source").notNull().default("diario"),
    createdAt: createdAt(),
  },
  (t) => [
    index("alerts_status_opened_idx").on(t.status, t.openedOn),
    index("alerts_house_idx").on(t.houseId, t.ruleCode),
    check("alerts_status_check", inList("status", [...ALERT_STATUSES])),
    check("alerts_severity_check", inList("severity", ["baixa", "media", "alta", "critica", "aviso"])),
    check("alerts_source_check", inList("source", ["backtest", "diario", "ao_vivo"])),
  ],
);

export const incidents = app.table("incidents", {
  id: id(),
  tenantId: tenantId(),
  scope: text("scope").notNull(),
  houseId: uuid("house_id"),
  title: text("title").notNull(),
  openedOn: date("opened_on").notNull(),
  closedOn: date("closed_on"),
  status: text("status").notNull().default("aberto"),
  createdAt: createdAt(),
});

export const notifications = app.table(
  "notifications",
  {
    id: id(),
    tenantId: tenantId(),
    userId: uuid("user_id"),
    alertId: uuid("alert_id"),
    houseId: uuid("house_id"),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    link: text("link"),
    createdAt: createdAt(),
    readAt: timestamp("read_at", { withTimezone: true }),
  },
  (t) => [index("notifications_created_idx").on(t.createdAt)],
);

/** Leitura de notificações gerais (user_id nulo) por usuário. */
export const notificationReads = app.table(
  "notification_reads",
  {
    notificationId: uuid("notification_id").notNull(),
    userId: uuid("user_id").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.notificationId, t.userId] })],
);

export const anomalyQuestions = app.table("anomaly_questions", {
  id: id(),
  tenantId: tenantId(),
  alertId: uuid("alert_id").notNull(),
  houseId: uuid("house_id").notNull(),
  question: text("question").notNull(),
  options: jsonb("options").notNull(),
  askedAt: timestamp("asked_at", { withTimezone: true }).notNull().defaultNow(),
  answeredBy: uuid("answered_by"),
  answerCode: text("answer_code"),
  answerText: text("answer_text"),
  answeredAt: timestamp("answered_at", { withTimezone: true }),
  eventId: uuid("event_id"),
});

export const decisions = app.table(
  "decisions",
  {
    id: id(),
    tenantId: tenantId(),
    weekStart: date("week_start").notNull(),
    text: text("text").notNull(),
    ownerName: text("owner_name").notNull(),
    dueDate: date("due_date"),
    status: text("status").notNull().default("aberta"),
    createdBy: uuid("created_by"),
    createdAt: createdAt(),
  },
  () => [check("decisions_status_check", inList("status", ["aberta", "concluida", "cancelada"]))],
);

export const houseNotes = app.table("house_notes", {
  id: id(),
  houseId: uuid("house_id").notNull(),
  userId: uuid("user_id"),
  text: text("text").notNull(),
  createdAt: createdAt(),
});

export const reportRuns = app.table("report_runs", {
  id: id(),
  tenantId: tenantId(),
  type: text("type").notNull(),
  weekStart: date("week_start").notNull(),
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
  snapshot: jsonb("snapshot").notNull(),
  dataChangedAfter: boolean("data_changed_after").notNull().default(false),
});

export const auditLog = app.table(
  "audit_log",
  {
    id: id(),
    tenantId: tenantId(),
    userId: uuid("user_id"),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_log_at_idx").on(t.at)],
);

/** Registro de execuções de rotinas (avanço diário, cenários ao vivo) — Parte 19.4. */
export const jobRuns = app.table("job_runs", {
  id: id(),
  tenantId: tenantId(),
  job: text("job").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  ok: boolean("ok").notNull().default(true),
  summary: jsonb("summary").notNull().default({}),
});

/** Relatórios favoritos dos comparativos, por usuário (Parte 14.16). */
export const savedComparisons = app.table("saved_comparisons", {
  id: id(),
  userId: uuid("user_id").notNull(),
  name: text("name").notNull(),
  params: jsonb("params").notNull(),
  createdAt: createdAt(),
});

/** Dados do sistema: data de referência, D_end, semente (chave/valor). */
export const systemState = app.table("system_state", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// 5.7 Assistente
// ---------------------------------------------------------------------------

export const aiConversations = app.table("ai_conversations", {
  id: id(),
  userId: uuid("user_id").notNull(),
  title: text("title").notNull(),
  createdAt: createdAt(),
});

export const aiMessages = app.table(
  "ai_messages",
  {
    id: id(),
    conversationId: uuid("conversation_id").notNull(),
    role: text("role").notNull(),
    content: jsonb("content").notNull(),
    mode: text("mode").notNull().default("reserva"),
    /** "útil / não útil" (Parte 13.4) */
    feedback: text("feedback"),
    createdAt: createdAt(),
  },
  (t) => [index("ai_messages_conv_idx").on(t.conversationId, t.createdAt)],
);

export const aiToolCalls = app.table("ai_tool_calls", {
  id: id(),
  messageId: uuid("message_id").notNull(),
  tool: text("tool").notNull(),
  input: jsonb("input").notNull(),
  outputSummary: jsonb("output_summary"),
  durationMs: integer("duration_ms"),
  createdAt: createdAt(),
});

export const aiUsage = app.table(
  "ai_usage",
  {
    userId: uuid("user_id").notNull(),
    date: date("date").notNull(),
    messages: integer("messages").notNull().default(0),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.date] })],
);

export const companyMemory = app.table("company_memory", {
  id: id(),
  tenantId: tenantId(),
  text: text("text").notNull(),
  createdBy: uuid("created_by"),
  createdAt: createdAt(),
  active: boolean("active").notNull().default(true),
});
