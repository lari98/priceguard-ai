CREATE TABLE "account_feature_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"end_account_id" uuid NOT NULL,
	"snapshot_date" timestamp with time zone NOT NULL,
	"event_count" integer DEFAULT 0 NOT NULL,
	"distinct_country_count" integer DEFAULT 0 NOT NULL,
	"distinct_ip_count" integer DEFAULT 0 NOT NULL,
	"vpn_event_ratio" real DEFAULT 0 NOT NULL,
	"avg_risk_score" real,
	"max_risk_score" integer,
	"feature_version" text DEFAULT 'v1' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feature_snapshots_tenant_account_date_unique" UNIQUE("tenant_id","end_account_id","snapshot_date")
);
--> statement-breakpoint
ALTER TABLE "account_feature_snapshots" ADD CONSTRAINT "account_feature_snapshots_end_account_id_end_accounts_id_fk" FOREIGN KEY ("end_account_id") REFERENCES "public"."end_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feature_snapshots_tenant_date_idx" ON "account_feature_snapshots" USING btree ("tenant_id","snapshot_date");