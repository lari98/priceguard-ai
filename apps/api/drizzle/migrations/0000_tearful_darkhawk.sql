CREATE TYPE "public"."actor_type" AS ENUM('USER', 'SYSTEM', 'API_KEY');--> statement-breakpoint
CREATE TYPE "public"."appeal_status" AS ENUM('OPEN', 'UPHELD', 'OVERTURNED');--> statement-breakpoint
CREATE TYPE "public"."confidence" AS ENUM('LOW', 'MEDIUM', 'HIGH');--> statement-breakpoint
CREATE TYPE "public"."data_residency" AS ENUM('EU', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."investigation_status" AS ENUM('PENDING', 'IN_REVIEW', 'RESOLVED');--> statement-breakpoint
CREATE TYPE "public"."policy_action" AS ENUM('NONE', 'MONITOR', 'WARN', 'REQUEST_VERIFICATION', 'RESTRICT', 'MANUAL_REVIEW', 'SUSPEND', 'TERMINATE');--> statement-breakpoint
CREATE TYPE "public"."risk_event_type" AS ENUM('LOGIN', 'SESSION_START', 'PAYMENT', 'SUBSCRIPTION_REGION_CHANGE');--> statement-breakpoint
CREATE TYPE "public"."tenant_role" AS ENUM('ADMIN', 'ANALYST', 'VIEWER');--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"key_prefix" text NOT NULL,
	"key_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "api_keys_key_prefix_unique" UNIQUE("key_prefix")
);
--> statement-breakpoint
CREATE TABLE "appeals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"investigation_id" uuid NOT NULL,
	"submitted_by_external_id" text NOT NULL,
	"message" text NOT NULL,
	"status" "appeal_status" DEFAULT 'OPEN' NOT NULL,
	"decision_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "audit_log_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"actor_id" text,
	"actor_type" "actor_type" NOT NULL,
	"action" text NOT NULL,
	"before_state" jsonb,
	"after_state" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"end_account_id" uuid NOT NULL,
	"device_hash" text NOT NULL,
	"os_name" text,
	"timezone" text,
	"locale" text,
	"emulator_suspected" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "devices_tenant_hash_unique" UNIQUE("tenant_id","device_hash")
);
--> statement-breakpoint
CREATE TABLE "end_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"pricing_country" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "end_accounts_tenant_external_unique" UNIQUE("tenant_id","external_id")
);
--> statement-breakpoint
CREATE TABLE "investigations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"policy_decision_id" uuid NOT NULL,
	"status" "investigation_status" DEFAULT 'PENDING' NOT NULL,
	"assigned_to_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "investigations_policy_decision_id_unique" UNIQUE("policy_decision_id")
);
--> statement-breakpoint
CREATE TABLE "payment_signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"end_account_id" uuid NOT NULL,
	"provider_token" text,
	"issuing_country" text,
	"currency" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policy_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"risk_score_id" uuid NOT NULL,
	"policy_id" uuid,
	"matched_rule_id" uuid,
	"action" "policy_action" NOT NULL,
	"requires_human_review" boolean NOT NULL,
	"approved" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "policy_decisions_risk_score_id_unique" UNIQUE("risk_score_id")
);
--> statement-breakpoint
CREATE TABLE "retention_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"raw_ip_days" integer DEFAULT 7 NOT NULL,
	"derived_feature_days" integer DEFAULT 90 NOT NULL,
	"risk_event_days" integer DEFAULT 180 NOT NULL,
	"audit_log_days" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "retention_policies_tenant_id_unique" UNIQUE("tenant_id")
);
--> statement-breakpoint
CREATE TABLE "risk_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"end_account_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"event_type" "risk_event_type" NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "risk_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"risk_event_id" uuid NOT NULL,
	"score" integer NOT NULL,
	"confidence" "confidence" NOT NULL,
	"likely_primary_country" jsonb NOT NULL,
	"evidence" jsonb NOT NULL,
	"reason_codes" jsonb NOT NULL,
	"model_version" text NOT NULL,
	"policy_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "risk_scores_risk_event_id_unique" UNIQUE("risk_event_id")
);
--> statement-breakpoint
CREATE TABLE "rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"policy_id" uuid NOT NULL,
	"name" text NOT NULL,
	"condition" jsonb NOT NULL,
	"action" "policy_action" NOT NULL,
	"requires_human_review" boolean DEFAULT true NOT NULL,
	"order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"end_account_id" uuid NOT NULL,
	"device_id" uuid,
	"ip_address" text NOT NULL,
	"derived_country" text,
	"asn" text,
	"vpn_likelihood" real DEFAULT 0,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "tenant_role" DEFAULT 'ANALYST' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_users_tenant_email_unique" UNIQUE("tenant_id","email")
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"data_residency" "data_residency" DEFAULT 'EU' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_investigation_id_investigations_id_fk" FOREIGN KEY ("investigation_id") REFERENCES "public"."investigations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log_entries" ADD CONSTRAINT "audit_log_entries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_end_account_id_end_accounts_id_fk" FOREIGN KEY ("end_account_id") REFERENCES "public"."end_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "end_accounts" ADD CONSTRAINT "end_accounts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investigations" ADD CONSTRAINT "investigations_policy_decision_id_policy_decisions_id_fk" FOREIGN KEY ("policy_decision_id") REFERENCES "public"."policy_decisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_signals" ADD CONSTRAINT "payment_signals_end_account_id_end_accounts_id_fk" FOREIGN KEY ("end_account_id") REFERENCES "public"."end_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policies" ADD CONSTRAINT "policies_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_decisions" ADD CONSTRAINT "policy_decisions_risk_score_id_risk_scores_id_fk" FOREIGN KEY ("risk_score_id") REFERENCES "public"."risk_scores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_decisions" ADD CONSTRAINT "policy_decisions_policy_id_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."policies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retention_policies" ADD CONSTRAINT "retention_policies_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_events" ADD CONSTRAINT "risk_events_end_account_id_end_accounts_id_fk" FOREIGN KEY ("end_account_id") REFERENCES "public"."end_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_events" ADD CONSTRAINT "risk_events_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_scores" ADD CONSTRAINT "risk_scores_risk_event_id_risk_events_id_fk" FOREIGN KEY ("risk_event_id") REFERENCES "public"."risk_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rules" ADD CONSTRAINT "rules_policy_id_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."policies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_end_account_id_end_accounts_id_fk" FOREIGN KEY ("end_account_id") REFERENCES "public"."end_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_users" ADD CONSTRAINT "tenant_users_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_keys_tenant_idx" ON "api_keys" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "appeals_tenant_investigation_idx" ON "appeals" USING btree ("tenant_id","investigation_id");--> statement-breakpoint
CREATE INDEX "audit_log_tenant_time_idx" ON "audit_log_entries" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "devices_tenant_account_idx" ON "devices" USING btree ("tenant_id","end_account_id");--> statement-breakpoint
CREATE INDEX "end_accounts_tenant_idx" ON "end_accounts" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "investigations_tenant_idx" ON "investigations" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "payment_signals_tenant_account_idx" ON "payment_signals" USING btree ("tenant_id","end_account_id");--> statement-breakpoint
CREATE INDEX "policies_tenant_active_idx" ON "policies" USING btree ("tenant_id","active");--> statement-breakpoint
CREATE INDEX "risk_events_tenant_account_time_idx" ON "risk_events" USING btree ("tenant_id","end_account_id","occurred_at");--> statement-breakpoint
CREATE INDEX "rules_policy_idx" ON "rules" USING btree ("policy_id");--> statement-breakpoint
CREATE INDEX "sessions_tenant_account_time_idx" ON "sessions" USING btree ("tenant_id","end_account_id","occurred_at");--> statement-breakpoint
CREATE INDEX "tenant_users_tenant_idx" ON "tenant_users" USING btree ("tenant_id");