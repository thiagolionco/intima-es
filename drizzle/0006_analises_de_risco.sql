CREATE TABLE "processo_analises" (
	"id" uuid PRIMARY KEY NOT NULL,
	"escritorio_id" uuid NOT NULL,
	"processo_id" uuid NOT NULL,
	"nivel" text NOT NULL,
	"resultado" jsonb NOT NULL,
	"modelo" text NOT NULL,
	"autor_id" uuid NOT NULL,
	"autor_nome" text NOT NULL,
	"criado_em" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "processo_analises" ADD CONSTRAINT "processo_analises_escritorio_id_escritorios_id_fk" FOREIGN KEY ("escritorio_id") REFERENCES "public"."escritorios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processo_analises" ADD CONSTRAINT "processo_analises_processo_id_processos_id_fk" FOREIGN KEY ("processo_id") REFERENCES "public"."processos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "processo_analises_processo_idx" ON "processo_analises" USING btree ("processo_id");--> statement-breakpoint
CREATE INDEX "processo_analises_escritorio_idx" ON "processo_analises" USING btree ("escritorio_id");--> statement-breakpoint
-- Análises de risco são dados do escritório: mesmo isolamento por RLS de processos (migração 0003).
-- Só SELECT e INSERT: o histórico das análises não muda nem é apagado pelo app (some só com o processo).
GRANT SELECT, INSERT ON processo_analises TO sentinela_app;
--> statement-breakpoint
ALTER TABLE processo_analises ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE processo_analises FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY analises_do_escritorio ON processo_analises TO sentinela_app
  USING (escritorio_id = nullif(current_setting('app.escritorio_id', true), '')::uuid)
  WITH CHECK (escritorio_id = nullif(current_setting('app.escritorio_id', true), '')::uuid);
--> statement-breakpoint
-- Sem acesso para os papéis que o Supabase expõe pela API de dados.
DO $$
DECLARE papel text;
BEGIN
  FOREACH papel IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = papel) THEN
      EXECUTE format('REVOKE ALL ON processo_analises FROM %I', papel);
    END IF;
  END LOOP;
END
$$;
