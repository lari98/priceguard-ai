CREATE TYPE "public"."auth_provider" AS ENUM('LOCAL', 'OIDC');--> statement-breakpoint
CREATE TABLE "revoked_tokens" (
	"jti" uuid PRIMARY KEY NOT NULL,
	"tenant_user_id" uuid NOT NULL,
	"revoked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_permission_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"role" "tenant_role" NOT NULL,
	"permission" text NOT NULL,
	"granted" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_permission_overrides_unique" UNIQUE("tenant_id","role","permission")
);
--> statement-breakpoint
CREATE TABLE "sso_configs" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"issuer_url" text NOT NULL,
	"client_id" text NOT NULL,
	"client_secret" text NOT NULL,
	"redirect_uri" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sso_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_user_id" uuid NOT NULL,
	"subject" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sso_identities_tenant_subject_unique" UNIQUE("tenant_id","subject")
);
--> statement-breakpoint
CREATE TABLE "sso_login_attempts" (
	"state" text PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"nonce" text NOT NULL,
	"code_verifier" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenant_users" ALTER COLUMN "password_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_users" ADD COLUMN "auth_provider" "auth_provider" DEFAULT 'LOCAL' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_users" ADD COLUMN "token_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "role_permission_overrides" ADD CONSTRAINT "role_permission_overrides_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sso_configs" ADD CONSTRAINT "sso_configs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sso_identities" ADD CONSTRAINT "sso_identities_tenant_user_id_tenant_users_id_fk" FOREIGN KEY ("tenant_user_id") REFERENCES "public"."tenant_users"("id") ON DELETE cascade ON UPDATE no action;