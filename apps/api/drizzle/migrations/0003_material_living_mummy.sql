CREATE TABLE "device_account_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"end_account_id" uuid NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "device_account_links_device_account_unique" UNIQUE("device_id","end_account_id")
);
--> statement-breakpoint
CREATE TABLE "fraud_clusters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"end_account_ids" jsonb NOT NULL,
	"shared_signals" jsonb NOT NULL,
	"cluster_size" integer NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "device_account_links" ADD CONSTRAINT "device_account_links_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_account_links" ADD CONSTRAINT "device_account_links_end_account_id_end_accounts_id_fk" FOREIGN KEY ("end_account_id") REFERENCES "public"."end_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "device_account_links_tenant_idx" ON "device_account_links" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "fraud_clusters_tenant_idx" ON "fraud_clusters" USING btree ("tenant_id");