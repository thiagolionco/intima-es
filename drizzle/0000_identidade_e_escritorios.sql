CREATE TABLE "auditoria" (
	"id" text PRIMARY KEY NOT NULL,
	"ordem" bigserial NOT NULL,
	"usuario_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"em" timestamp with time zone NOT NULL,
	"ip" text NOT NULL,
	"user_agent" text NOT NULL,
	"detalhe" text
);
--> statement-breakpoint
CREATE TABLE "desafios_dois_fatores" (
	"id" text PRIMARY KEY NOT NULL,
	"usuario_id" uuid NOT NULL,
	"lembrar" boolean NOT NULL,
	"tentativas" integer NOT NULL,
	"expira_em" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "escritorios" (
	"id" uuid PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"criado_em" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "espacos_trabalho" (
	"escritorio_id" uuid PRIMARY KEY NOT NULL,
	"intimacoes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"termos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"revisao" integer DEFAULT 0 NOT NULL,
	"atualizado_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "membros" (
	"escritorio_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"papel" text NOT NULL,
	"criado_em" timestamp with time zone NOT NULL,
	CONSTRAINT "membros_escritorio_id_usuario_id_pk" PRIMARY KEY("escritorio_id","usuario_id")
);
--> statement-breakpoint
CREATE TABLE "sessoes" (
	"id" text PRIMARY KEY NOT NULL,
	"usuario_id" uuid NOT NULL,
	"criada_em" timestamp with time zone NOT NULL,
	"ultimo_uso_em" timestamp with time zone NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"lembrar" boolean NOT NULL,
	"ip" text NOT NULL,
	"user_agent" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tokens_verificacao" (
	"id" text PRIMARY KEY NOT NULL,
	"usuario_id" uuid NOT NULL,
	"finalidade" text NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"criado_em" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" uuid PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"email" text NOT NULL,
	"escritorio" text,
	"oab" text,
	"senha_hash" text NOT NULL,
	"email_confirmado_em" timestamp with time zone,
	"totp_segredo" text,
	"totp_ativo" boolean DEFAULT false NOT NULL,
	"totp_ultimo_passo" integer,
	"codigos_recuperacao" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tentativas_falhas" integer DEFAULT 0 NOT NULL,
	"bloqueado_ate" timestamp with time zone,
	"senha_alterada_em" timestamp with time zone NOT NULL,
	"aceitou_termos_em" timestamp with time zone NOT NULL,
	"criado_em" timestamp with time zone NOT NULL,
	"atualizado_em" timestamp with time zone NOT NULL,
	CONSTRAINT "usuarios_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "desafios_dois_fatores" ADD CONSTRAINT "desafios_dois_fatores_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "espacos_trabalho" ADD CONSTRAINT "espacos_trabalho_escritorio_id_escritorios_id_fk" FOREIGN KEY ("escritorio_id") REFERENCES "public"."escritorios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membros" ADD CONSTRAINT "membros_escritorio_id_escritorios_id_fk" FOREIGN KEY ("escritorio_id") REFERENCES "public"."escritorios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membros" ADD CONSTRAINT "membros_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessoes" ADD CONSTRAINT "sessoes_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tokens_verificacao" ADD CONSTRAINT "tokens_verificacao_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auditoria_usuario_ordem_idx" ON "auditoria" USING btree ("usuario_id","ordem");--> statement-breakpoint
CREATE INDEX "membros_usuario_idx" ON "membros" USING btree ("usuario_id");--> statement-breakpoint
CREATE INDEX "sessoes_usuario_idx" ON "sessoes" USING btree ("usuario_id");--> statement-breakpoint
CREATE INDEX "sessoes_expira_idx" ON "sessoes" USING btree ("expira_em");--> statement-breakpoint
CREATE INDEX "tokens_usuario_idx" ON "tokens_verificacao" USING btree ("usuario_id");