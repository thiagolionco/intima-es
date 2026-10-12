CREATE TABLE "processo_pareceres" (
	"id" uuid PRIMARY KEY NOT NULL,
	"escritorio_id" uuid NOT NULL,
	"processo_id" uuid NOT NULL,
	"versao" integer NOT NULL,
	"texto" text NOT NULL,
	"autor_id" uuid NOT NULL,
	"autor_nome" text NOT NULL,
	"criado_em" timestamp with time zone NOT NULL,
	CONSTRAINT "processo_pareceres_processo_versao_key" UNIQUE("processo_id","versao")
);
--> statement-breakpoint
ALTER TABLE "processo_pareceres" ADD CONSTRAINT "processo_pareceres_escritorio_id_escritorios_id_fk" FOREIGN KEY ("escritorio_id") REFERENCES "public"."escritorios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processo_pareceres" ADD CONSTRAINT "processo_pareceres_processo_id_processos_id_fk" FOREIGN KEY ("processo_id") REFERENCES "public"."processos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "processo_pareceres_escritorio_idx" ON "processo_pareceres" USING btree ("escritorio_id");--> statement-breakpoint
-- Pareceres são dados do escritório: mesmo isolamento por RLS de processos (migração 0003).
-- Só SELECT e INSERT: uma versão gravada não muda nem é apagada pelo app (some só com o processo).
GRANT SELECT, INSERT ON processo_pareceres TO sentinela_app;
--> statement-breakpoint
ALTER TABLE processo_pareceres ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE processo_pareceres FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY pareceres_do_escritorio ON processo_pareceres TO sentinela_app
  USING (escritorio_id = nullif(current_setting('app.escritorio_id', true), '')::uuid)
  WITH CHECK (escritorio_id = nullif(current_setting('app.escritorio_id', true), '')::uuid);
--> statement-breakpoint
-- Sem acesso para os papéis que o Supabase expõe pela API de dados.
DO $$
DECLARE papel text;
BEGIN
  FOREACH papel IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = papel) THEN
      EXECUTE format('REVOKE ALL ON processo_pareceres FROM %I', papel);
    END IF;
  END LOOP;
END
$$;
