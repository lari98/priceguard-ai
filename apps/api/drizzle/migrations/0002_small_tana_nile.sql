CREATE TABLE "ml_models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" text NOT NULL,
	"weights" jsonb NOT NULL,
	"feature_names" jsonb NOT NULL,
	"training_example_count" integer NOT NULL,
	"holdout_accuracy" real NOT NULL,
	"trained_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ml_models_version_unique" UNIQUE("version")
);
--> statement-breakpoint
CREATE TABLE "ml_rollout_config" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"shadow_model_version" text,
	"rollout_percentage" integer DEFAULT 0 NOT NULL,
	"approved_by_user_id" uuid,
	"approved_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ml_shadow_evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"risk_score_id" uuid NOT NULL,
	"model_version" text NOT NULL,
	"production_score" integer NOT NULL,
	"shadow_score" integer NOT NULL,
	"agreement" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "risk_scores" ADD COLUMN "facts" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "ml_rollout_config" ADD CONSTRAINT "ml_rollout_config_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ml_shadow_evaluations" ADD CONSTRAINT "ml_shadow_evaluations_risk_score_id_risk_scores_id_fk" FOREIGN KEY ("risk_score_id") REFERENCES "public"."risk_scores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ml_shadow_evaluations_tenant_model_idx" ON "ml_shadow_evaluations" USING btree ("tenant_id","model_version");