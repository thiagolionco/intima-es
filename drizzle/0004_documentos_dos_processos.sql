CREATE TABLE "processo_documentos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"escritorio_id" uuid NOT NULL,
	"processo_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"tamanho" integer NOT NULL,
	"hash" text NOT NULL,
	"caminho" text NOT NULL,
	"criado_em" timestamp with time zone NOT NULL,
	CONSTRAINT "processo_documentos_processo_hash_key" UNIQUE("processo_id","hash")
);
--> statement-breakpoint
ALTER TABLE "processo_documentos" ADD CONSTRAINT "processo_documentos_escritorio_id_escritorios_id_fk" FOREIGN KEY ("escritorio_id") REFERENCES "public"."escritorios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processo_documentos" ADD CONSTRAINT "processo_documentos_processo_id_processos_id_fk" FOREIGN KEY ("processo_id") REFERENCES "public"."processos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "processo_documentos_escritorio_idx" ON "processo_documentos" USING btree ("escritorio_id");--> statement-breakpoint
-- Documentos são dados do escritório: mesmo isolamento por RLS de processos (migração 0003).
GRANT SELECT, INSERT, UPDATE, DELETE ON processo_documentos TO sentinela_app;
--> statement-breakpoint
ALTER TABLE processo_documentos ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE processo_documentos FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY documentos_do_escritorio ON processo_documentos TO sentinela_app
  USING (escritorio_id = nullif(current_setting('app.escritorio_id', true), '')::uuid)
  WITH CHECK (escritorio_id = nullif(current_setting('app.escritorio_id', true), '')::uuid);
--> statement-breakpoint
-- Sem acesso para os papéis que o Supabase expõe pela API de dados.
DO $$
DECLARE papel text;
BEGIN
  FOREACH papel IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = papel) THEN
      EXECUTE format('REVOKE ALL ON processo_documentos FROM %I', papel);
    END IF;
  END LOOP;
END
$$;
