CREATE SCHEMA IF NOT EXISTS "app";
--> statement-breakpoint
CREATE TABLE "app"."ai_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."ai_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" jsonb NOT NULL,
	"mode" text DEFAULT 'reserva' NOT NULL,
	"feedback" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."ai_tool_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"tool" text NOT NULL,
	"input" jsonb NOT NULL,
	"output_summary" jsonb,
	"duration_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."ai_usage" (
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"messages" integer DEFAULT 0 NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "ai_usage_user_id_date_pk" PRIMARY KEY("user_id","date")
);
--> statement-breakpoint
CREATE TABLE "app"."alert_rules" (
	"code" text PRIMARY KEY NOT NULL,
	"name_pt" text NOT NULL,
	"description_pt" text NOT NULL,
	"anomaly_type" text NOT NULL,
	"severity_default" text NOT NULL,
	"params" jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"kind" text DEFAULT 'diaria' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"rule_code" text NOT NULL,
	"house_id" uuid,
	"flock_id" uuid,
	"metric_code" text,
	"anomaly_type" text NOT NULL,
	"first_deviation_on" date NOT NULL,
	"opened_on" date NOT NULL,
	"opened_at" timestamp with time zone NOT NULL,
	"last_seen_on" date NOT NULL,
	"closed_on" date,
	"status" text DEFAULT 'aberto' NOT NULL,
	"severity" text NOT NULL,
	"title" text NOT NULL,
	"observed" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"hypotheses" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"decomposition" jsonb,
	"similar_cases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"incident_id" uuid,
	"ack_by" uuid,
	"ack_at" timestamp with time zone,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"cause_code" text,
	"cause_note" text,
	"action_taken" text,
	"was_useful" boolean,
	"discard_reason" text,
	"reopened_count" integer DEFAULT 0 NOT NULL,
	"silenced_until" date,
	"source" text DEFAULT 'diario' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "alerts_status_check" CHECK (status in ('aberto', 'reconhecido', 'em_investigacao', 'resolvido', 'descartado')),
	CONSTRAINT "alerts_severity_check" CHECK (severity in ('baixa', 'media', 'alta', 'critica', 'aviso')),
	CONSTRAINT "alerts_source_check" CHECK (source in ('backtest', 'diario', 'ao_vivo'))
);
--> statement-breakpoint
CREATE TABLE "app"."anomaly_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"alert_id" uuid NOT NULL,
	"house_id" uuid NOT NULL,
	"question" text NOT NULL,
	"options" jsonb NOT NULL,
	"asked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"answered_by" uuid,
	"answer_code" text,
	"answer_text" text,
	"answered_at" timestamp with time zone,
	"event_id" uuid
);
--> statement-breakpoint
CREATE TABLE "app"."audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"before" jsonb,
	"after" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."body_weight_samples" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"house_id" uuid NOT NULL,
	"flock_id" uuid NOT NULL,
	"date" date NOT NULL,
	"n" integer NOT NULL,
	"mean_g" double precision NOT NULL,
	"cv_pct" double precision NOT NULL,
	"uniformity_pct" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."company_memory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"text" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."cost_params" (
	"tenant_id" uuid NOT NULL,
	"key" text NOT NULL,
	"value" double precision NOT NULL,
	"unit" text NOT NULL,
	"label_pt" text NOT NULL,
	CONSTRAINT "cost_params_tenant_id_key_pk" PRIMARY KEY("tenant_id","key")
);
--> statement-breakpoint
CREATE TABLE "app"."daily_env" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"house_id" uuid,
	"date" date NOT NULL,
	"temp_max" double precision,
	"temp_min" double precision,
	"temp_mean" double precision,
	"rh_mean" double precision,
	"hours_above_30" double precision,
	"hours_above_32" double precision,
	"degree_hours_30" double precision,
	"nh3_max" double precision,
	"night_max" double precision
);
--> statement-breakpoint
CREATE TABLE "app"."daily_metrics" (
	"tenant_id" uuid NOT NULL,
	"house_id" uuid NOT NULL,
	"flock_id" uuid NOT NULL,
	"date" date NOT NULL,
	"age_days" integer NOT NULL,
	"age_week" smallint NOT NULL,
	"phase" text NOT NULL,
	"metric_code" text NOT NULL,
	"value" double precision,
	"numerator" double precision,
	"denominator" double precision,
	"quality_flag" smallint DEFAULT 0 NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_metrics_house_id_date_metric_code_pk" PRIMARY KEY("house_id","date","metric_code")
);
--> statement-breakpoint
CREATE TABLE "app"."daily_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"house_id" uuid NOT NULL,
	"flock_id" uuid NOT NULL,
	"date" date NOT NULL,
	"birds_start" integer NOT NULL,
	"deaths" integer NOT NULL,
	"deaths_by_cause" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"culls" integer DEFAULT 0 NOT NULL,
	"feed_kg" double precision,
	"water_l" double precision,
	"egg_weight_g" double precision,
	"light_hours" double precision,
	"feed_batch_id" uuid,
	"source" text DEFAULT 'simulado' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"week_start" date NOT NULL,
	"text" text NOT NULL,
	"owner_name" text NOT NULL,
	"due_date" date,
	"status" text DEFAULT 'aberta' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "decisions_status_check" CHECK (status in ('aberta', 'concluida', 'cancelada'))
);
--> statement-breakpoint
CREATE TABLE "app"."device_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" uuid NOT NULL,
	"house_id" uuid NOT NULL,
	"lane" smallint,
	"valid_from" date NOT NULL,
	"valid_to" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code" text NOT NULL,
	"type" text NOT NULL,
	"model_version" text,
	"firmware" text,
	"status" text DEFAULT 'simulado' NOT NULL,
	"last_seen_at" timestamp with time zone,
	"confidence_score" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "devices_code_unique" UNIQUE("code"),
	CONSTRAINT "devices_type_check" CHECK (type in ('contador', 'gateway')),
	CONSTRAINT "devices_status_check" CHECK (status in ('online', 'offline', 'simulado'))
);
--> statement-breakpoint
CREATE TABLE "app"."egg_counts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"house_id" uuid NOT NULL,
	"device_id" uuid,
	"date" date NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"window_minutes" smallint NOT NULL,
	"lane" smallint NOT NULL,
	"egg_class" text NOT NULL,
	"qty" integer NOT NULL,
	"mean_conf" real,
	"model_version" text,
	"message_id" text,
	"quality_flag" smallint DEFAULT 0 NOT NULL,
	"source" text DEFAULT 'simulado' NOT NULL,
	CONSTRAINT "egg_counts_class_check" CHECK (egg_class in ('clean', 'dirty_feces', 'dirty_blood', 'cracked', 'broken', 'undetermined')),
	CONSTRAINT "egg_counts_window_check" CHECK (window_minutes in (1440, 60, 1)),
	CONSTRAINT "egg_counts_source_check" CHECK (source in ('simulado', 'ao_vivo'))
);
--> statement-breakpoint
CREATE TABLE "app"."event_certainty_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"from_certainty" text,
	"to_certainty" text NOT NULL,
	"by_user" uuid,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "app"."event_fingerprints" (
	"event_id" uuid NOT NULL,
	"house_id" uuid NOT NULL,
	"vector" real[] NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_fingerprints_event_id_house_id_pk" PRIMARY KEY("event_id","house_id")
);
--> statement-breakpoint
CREATE TABLE "app"."event_impacts" (
	"event_id" uuid NOT NULL,
	"house_id" uuid NOT NULL,
	"metric_code" text NOT NULL,
	"is_control" boolean DEFAULT false NOT NULL,
	"base_mean" double precision,
	"base_robust_sd" double precision,
	"effect_mean" double precision,
	"delta_abs" double precision,
	"delta_pct" double precision,
	"z" double precision,
	"worst_value" double precision,
	"lag_days" integer,
	"recovery_days" integer,
	"loss_eggs" double precision,
	"loss_brl" double precision,
	"window_closed" boolean DEFAULT false NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_impacts_event_id_house_id_metric_code_pk" PRIMARY KEY("event_id","house_id","metric_code")
);
--> statement-breakpoint
CREATE TABLE "app"."event_links" (
	"event_id" uuid NOT NULL,
	"alert_id" uuid NOT NULL,
	CONSTRAINT "event_links_event_id_alert_id_pk" PRIMARY KEY("event_id","alert_id")
);
--> statement-breakpoint
CREATE TABLE "app"."event_scopes" (
	"event_id" uuid NOT NULL,
	"house_id" uuid NOT NULL,
	"flock_id" uuid,
	CONSTRAINT "event_scopes_event_id_house_id_pk" PRIMARY KEY("event_id","house_id")
);
--> statement-breakpoint
CREATE TABLE "app"."event_types" (
	"code" text PRIMARY KEY NOT NULL,
	"category" text NOT NULL,
	"name_pt" text NOT NULL,
	"base_days" integer NOT NULL,
	"effect_days" integer NOT NULL,
	"effect_plus_duration" boolean DEFAULT false NOT NULL,
	"recovery_days" integer NOT NULL,
	"fields_schema" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"icon" text NOT NULL,
	CONSTRAINT "event_types_category_check" CHECK (category in ('sanitario', 'manejo', 'ambiente', 'estrutura', 'detectado', 'outro'))
);
--> statement-breakpoint
CREATE TABLE "app"."events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"type_code" text NOT NULL,
	"title" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"severity" text DEFAULT 'media' NOT NULL,
	"certainty" text DEFAULT 'suspeito' NOT NULL,
	"confirmed_by" text,
	"description" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"action_taken" text,
	"cost_brl" double precision,
	"source" text DEFAULT 'usuario' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completeness" text DEFAULT 'completo' NOT NULL,
	CONSTRAINT "events_severity_check" CHECK (severity in ('baixa', 'media', 'alta', 'critica')),
	CONSTRAINT "events_certainty_check" CHECK (certainty in ('suspeito', 'provavel', 'confirmado', 'descartado')),
	CONSTRAINT "events_confirmed_by_check" CHECK (confirmed_by is null or confirmed_by in ('clinica', 'laboratorio', 'necropsia')),
	CONSTRAINT "events_source_check" CHECK (source in ('usuario', 'plataforma', 'simulado', 'assistente')),
	CONSTRAINT "events_completeness_check" CHECK (completeness in ('completo', 'incompleto'))
);
--> statement-breakpoint
CREATE TABLE "app"."farm_daily_metrics" (
	"tenant_id" uuid NOT NULL,
	"date" date NOT NULL,
	"metric_code" text NOT NULL,
	"value" double precision,
	"numerator" double precision,
	"denominator" double precision,
	"quality_flag" smallint DEFAULT 0 NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "farm_daily_metrics_tenant_id_date_metric_code_pk" PRIMARY KEY("tenant_id","date","metric_code")
);
--> statement-breakpoint
CREATE TABLE "app"."farm_weekly_metrics" (
	"tenant_id" uuid NOT NULL,
	"week_start" date NOT NULL,
	"metric_code" text NOT NULL,
	"value" double precision,
	"numerator" double precision,
	"denominator" double precision,
	"days_count" smallint NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "farm_weekly_metrics_tenant_id_week_start_metric_code_pk" PRIMARY KEY("tenant_id","week_start","metric_code")
);
--> statement-breakpoint
CREATE TABLE "app"."farms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"city" text NOT NULL,
	"state" text NOT NULL,
	"lat" double precision,
	"lon" double precision,
	"timezone" text DEFAULT 'America/Fortaleza' NOT NULL,
	"cutoff_hour" smallint DEFAULT 6 NOT NULL,
	"week_start_dow" smallint DEFAULT 0 NOT NULL,
	"phase_bounds" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."feed_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code" text NOT NULL,
	"delivered_on" date NOT NULL,
	"supplier" text NOT NULL,
	"formulation" text NOT NULL,
	"house_ids" uuid[] NOT NULL,
	"price_per_kg" double precision NOT NULL,
	"calcium_pct_spec" double precision NOT NULL,
	"lab_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feed_batches_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "app"."flock_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"flock_id" uuid NOT NULL,
	"house_id" uuid NOT NULL,
	"date" date NOT NULL,
	"type" text NOT NULL,
	"qty" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flock_movements_type_check" CHECK (type in ('alojamento', 'descarte_final', 'descarte_parcial', 'transferencia'))
);
--> statement-breakpoint
CREATE TABLE "app"."flock_placements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"flock_id" uuid NOT NULL,
	"house_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"birds_in" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."flocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code" text NOT NULL,
	"strain_id" uuid NOT NULL,
	"hatch_date" date NOT NULL,
	"birds_housed" integer NOT NULL,
	"chick_cost_brl" double precision NOT NULL,
	"planned_cull_age_weeks" smallint NOT NULL,
	"status" text NOT NULL,
	"quality_offset_pp" double precision DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flocks_code_unique" UNIQUE("code"),
	CONSTRAINT "flocks_status_check" CHECK (status in ('ativo', 'encerrado'))
);
--> statement-breakpoint
CREATE TABLE "app"."house_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"house_id" uuid NOT NULL,
	"user_id" uuid,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."houses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"farm_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"capacity" integer NOT NULL,
	"system_type" text NOT NULL,
	"lanes" smallint DEFAULT 2 NOT NULL,
	"cooling_delta_c" double precision NOT NULL,
	"color" text NOT NULL,
	"built_year" integer,
	"asset_value_brl" double precision,
	"sort_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"house_id" uuid,
	"title" text NOT NULL,
	"opened_on" date NOT NULL,
	"closed_on" date,
	"status" text DEFAULT 'aberto' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."internal_standards" (
	"strain_id" uuid NOT NULL,
	"age_week" smallint NOT NULL,
	"metric_code" text NOT NULL,
	"n_flocks" integer NOT NULL,
	"mean" double precision,
	"median" double precision,
	"p25" double precision,
	"p75" double precision,
	"excluded_weeks" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "internal_standards_strain_id_age_week_metric_code_pk" PRIMARY KEY("strain_id","age_week","metric_code")
);
--> statement-breakpoint
CREATE TABLE "app"."job_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"job" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"ok" boolean DEFAULT true NOT NULL,
	"summary" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."lab_samples" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"house_id" uuid NOT NULL,
	"flock_id" uuid NOT NULL,
	"date" date NOT NULL,
	"type" text DEFAULT 'casca' NOT NULL,
	"n_eggs" integer NOT NULL,
	"strength_kgf" double precision,
	"thickness_mm" double precision,
	"specific_gravity" double precision,
	"haugh" double precision,
	"egg_weight_g" double precision,
	"yolk_color" double precision,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."login_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"ip" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"success" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."metric_catalog" (
	"code" text PRIMARY KEY NOT NULL,
	"name_pt" text NOT NULL,
	"short_pt" text NOT NULL,
	"unit" text NOT NULL,
	"direction" text NOT NULL,
	"aggregation" text NOT NULL,
	"decimals" smallint NOT NULL,
	"group_pt" text NOT NULL,
	"description_pt" text NOT NULL,
	"has_strain_standard" boolean DEFAULT false NOT NULL,
	CONSTRAINT "metric_direction_check" CHECK (direction in ('maior_melhor', 'menor_melhor', 'neutro')),
	CONSTRAINT "metric_aggregation_check" CHECK (aggregation in ('soma', 'razao', 'media_ponderada', 'ultimo', 'max', 'min'))
);
--> statement-breakpoint
CREATE TABLE "app"."notification_reads" (
	"notification_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_reads_notification_id_user_id_pk" PRIMARY KEY("notification_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "app"."notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid,
	"alert_id" uuid,
	"house_id" uuid,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"link" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "app"."prices" (
	"tenant_id" uuid NOT NULL,
	"week_start" date NOT NULL,
	"item" text NOT NULL,
	"value_brl" double precision NOT NULL,
	CONSTRAINT "prices_tenant_id_week_start_item_pk" PRIMARY KEY("tenant_id","week_start","item"),
	CONSTRAINT "prices_item_check" CHECK (item in ('ovo_comercial_dz', 'ovo_trincado_dz', 'ovo_sujo_dz', 'racao_kg', 'ave_descarte_un'))
);
--> statement-breakpoint
CREATE TABLE "app"."report_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"type" text NOT NULL,
	"week_start" date NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"snapshot" jsonb NOT NULL,
	"data_changed_after" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."saved_comparisons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"params" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."sensor_readings" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"house_id" uuid,
	"ts" timestamp with time zone NOT NULL,
	"metric_code" text NOT NULL,
	"value" double precision NOT NULL,
	"quality_flag" smallint DEFAULT 0 NOT NULL,
	"source" text DEFAULT 'simulado' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."shelf_life_measurements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"test_id" uuid NOT NULL,
	"day" integer NOT NULL,
	"n" integer NOT NULL,
	"haugh_mean" double precision NOT NULL,
	"weight_loss_pct" double precision NOT NULL,
	"air_cell_mm" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."shelf_life_tests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"house_id" uuid NOT NULL,
	"flock_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"storage_temp_c" double precision NOT NULL,
	"storage_rh_pct" double precision NOT NULL,
	"schedule_days" integer[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."strain_standards" (
	"strain_id" uuid NOT NULL,
	"age_week" smallint NOT NULL,
	"metric_code" text NOT NULL,
	"value" double precision NOT NULL,
	CONSTRAINT "strain_standards_strain_id_age_week_metric_code_pk" PRIMARY KEY("strain_id","age_week","metric_code")
);
--> statement-breakpoint
CREATE TABLE "app"."strains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"shell_color" text NOT NULL,
	"guide_edition" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "strains_code_unique" UNIQUE("code"),
	CONSTRAINT "strains_shell_check" CHECK (shell_color in ('branco', 'vermelho'))
);
--> statement-breakpoint
CREATE TABLE "app"."system_state" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"metric_code" text NOT NULL,
	"phase" text,
	"green_min" double precision,
	"green_max" double precision,
	"yellow_min" double precision,
	"yellow_max" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text NOT NULL,
	"allowed_house_ids" uuid[],
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_role_check" CHECK (role in ('diretor', 'gerente', 'encarregado'))
);
--> statement-breakpoint
CREATE TABLE "app"."weather_forecast" (
	"farm_id" uuid NOT NULL,
	"date" date NOT NULL,
	"temp_max" double precision NOT NULL,
	"temp_min" double precision NOT NULL,
	"generated_on" date NOT NULL,
	CONSTRAINT "weather_forecast_farm_id_date_pk" PRIMARY KEY("farm_id","date")
);
--> statement-breakpoint
CREATE TABLE "app"."weekly_metrics" (
	"tenant_id" uuid NOT NULL,
	"house_id" uuid NOT NULL,
	"flock_id" uuid NOT NULL,
	"week_start" date NOT NULL,
	"age_week" smallint NOT NULL,
	"phase" text NOT NULL,
	"metric_code" text NOT NULL,
	"value" double precision,
	"numerator" double precision,
	"denominator" double precision,
	"days_count" smallint NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "weekly_metrics_house_id_week_start_metric_code_pk" PRIMARY KEY("house_id","week_start","metric_code")
);
--> statement-breakpoint
CREATE INDEX "ai_messages_conv_idx" ON "app"."ai_messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "alerts_status_opened_idx" ON "app"."alerts" USING btree ("status","opened_on");--> statement-breakpoint
CREATE INDEX "alerts_house_idx" ON "app"."alerts" USING btree ("house_id","rule_code");--> statement-breakpoint
CREATE INDEX "audit_log_at_idx" ON "app"."audit_log" USING btree ("at");--> statement-breakpoint
CREATE INDEX "body_weight_house_date_idx" ON "app"."body_weight_samples" USING btree ("house_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_env_house_date_uq" ON "app"."daily_env" USING btree (coalesce("house_id", '00000000-0000-0000-0000-000000000000'::uuid),"date");--> statement-breakpoint
CREATE INDEX "daily_env_date_idx" ON "app"."daily_env" USING btree ("date");--> statement-breakpoint
CREATE INDEX "daily_metrics_house_metric_date_idx" ON "app"."daily_metrics" USING btree ("house_id","metric_code","date");--> statement-breakpoint
CREATE INDEX "daily_metrics_metric_date_idx" ON "app"."daily_metrics" USING btree ("metric_code","date");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_records_house_date_uq" ON "app"."daily_records" USING btree ("house_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "egg_counts_uq" ON "app"."egg_counts" USING btree ("house_id","window_start","window_minutes","lane","egg_class");--> statement-breakpoint
CREATE INDEX "egg_counts_house_date_idx" ON "app"."egg_counts" USING btree ("house_id","date");--> statement-breakpoint
CREATE INDEX "egg_counts_message_idx" ON "app"."egg_counts" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "event_scopes_house_idx" ON "app"."event_scopes" USING btree ("house_id");--> statement-breakpoint
CREATE INDEX "events_starts_at_idx" ON "app"."events" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX "flock_placements_house_idx" ON "app"."flock_placements" USING btree ("house_id","start_date");--> statement-breakpoint
CREATE UNIQUE INDEX "houses_farm_code_uq" ON "app"."houses" USING btree ("farm_id","code");--> statement-breakpoint
CREATE INDEX "lab_samples_house_date_idx" ON "app"."lab_samples" USING btree ("house_id","date");--> statement-breakpoint
CREATE INDEX "login_attempts_email_at_idx" ON "app"."login_attempts" USING btree ("email","at");--> statement-breakpoint
CREATE INDEX "notifications_created_idx" ON "app"."notifications" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "sensor_readings_house_metric_ts_idx" ON "app"."sensor_readings" USING btree ("house_id","metric_code","ts");--> statement-breakpoint
CREATE INDEX "weekly_metrics_house_metric_week_idx" ON "app"."weekly_metrics" USING btree ("house_id","metric_code","week_start");