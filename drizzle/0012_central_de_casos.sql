CREATE TABLE "processo_eventos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"escritorio_id" uuid NOT NULL,
	"processo_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"de" text,
	"para" text,
	"item" text,
	"motivo" text,
	"autor_id" uuid NOT NULL,
	"autor_nome" text NOT NULL,
	"criado_em" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "processo_fluxo" (
	"processo_id" uuid PRIMARY KEY NOT NULL,
	"escritorio_id" uuid NOT NULL,
	"etapa" text NOT NULL,
	"etapa_desde" timestamp with time zone NOT NULL,
	"checklist" jsonb NOT NULL,
	"versao" integer NOT NULL,
	"atualizado_em" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "processo_eventos" ADD CONSTRAINT "processo_eventos_escritorio_id_escritorios_id_fk" FOREIGN KEY ("escritorio_id") REFERENCES "public"."escritorios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processo_eventos" ADD CONSTRAINT "processo_eventos_processo_id_processos_id_fk" FOREIGN KEY ("processo_id") REFERENCES "public"."processos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processo_fluxo" ADD CONSTRAINT "processo_fluxo_processo_id_processos_id_fk" FOREIGN KEY ("processo_id") REFERENCES "public"."processos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processo_fluxo" ADD CONSTRAINT "processo_fluxo_escritorio_id_escritorios_id_fk" FOREIGN KEY ("escritorio_id") REFERENCES "public"."escritorios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "processo_eventos_processo_idx" ON "processo_eventos" USING btree ("processo_id","criado_em");--> statement-breakpoint
CREATE INDEX "processo_eventos_escritorio_idx" ON "processo_eventos" USING btree ("escritorio_id");--> statement-breakpoint
CREATE INDEX "processo_fluxo_escritorio_idx" ON "processo_fluxo" USING btree ("escritorio_id");--> statement-breakpoint
-- Dados do escritório: mesmo isolamento por RLS de processos (migração 0003).
-- Estado da Central: o app lê, cria e atualiza (nunca apaga; some com o processo).
GRANT SELECT, INSERT, UPDATE ON processo_fluxo TO sentinela_app;
--> statement-breakpoint
-- Trilha de auditoria: só SELECT e INSERT. Um registro gravado não muda nem é apagado pelo app.
GRANT SELECT, INSERT ON processo_eventos TO sentinela_app;
--> statement-breakpoint
ALTER TABLE processo_fluxo ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE processo_fluxo FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE processo_eventos ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE processo_eventos FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY fluxo_do_escritorio ON processo_fluxo TO sentinela_app
  USING (escritorio_id = nullif(current_setting('app.escritorio_id', true), '')::uuid)
  WITH CHECK (escritorio_id = nullif(current_setting('app.escritorio_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY eventos_do_escritorio ON processo_eventos TO sentinela_app
  USING (escritorio_id = nullif(current_setting('app.escritorio_id', true), '')::uuid)
  WITH CHECK (escritorio_id = nullif(current_setting('app.escritorio_id', true), '')::uuid);
--> statement-breakpoint
-- Processo particular (migração 0011): o fluxo e a trilha seguem a visibilidade do processo.
CREATE POLICY fluxo_de_processo_visivel ON processo_fluxo AS RESTRICTIVE TO sentinela_app
  USING (EXISTS (SELECT 1 FROM processos p WHERE p.id = processo_id))
  WITH CHECK (EXISTS (SELECT 1 FROM processos p WHERE p.id = processo_id));
--> statement-breakpoint
CREATE POLICY eventos_de_processo_visivel ON processo_eventos AS RESTRICTIVE TO sentinela_app
  USING (EXISTS (SELECT 1 FROM processos p WHERE p.id = processo_id))
  WITH CHECK (EXISTS (SELECT 1 FROM processos p WHERE p.id = processo_id));
--> statement-breakpoint
-- Sem acesso para os papéis que o Supabase expõe pela API de dados.
DO $$
DECLARE papel text;
BEGIN
  FOREACH papel IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = papel) THEN
      EXECUTE format('REVOKE ALL ON processo_fluxo FROM %I', papel);
      EXECUTE format('REVOKE ALL ON processo_eventos FROM %I', papel);
    END IF;
  END LOOP;
END
$$;
