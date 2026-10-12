CREATE TABLE "processos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"escritorio_id" uuid NOT NULL,
	"numero" text NOT NULL,
	"cliente" text NOT NULL,
	"parte_contraria" text,
	"polo" text NOT NULL,
	"tribunal" text,
	"orgao" text,
	"classe" text,
	"valor_causa" bigint,
	"responsavel_id" text,
	"observacoes" text,
	"criado_em" timestamp with time zone NOT NULL,
	"atualizado_em" timestamp with time zone NOT NULL,
	CONSTRAINT "processos_escritorio_numero_key" UNIQUE("escritorio_id","numero")
);
--> statement-breakpoint
ALTER TABLE "processos" ADD CONSTRAINT "processos_escritorio_id_escritorios_id_fk" FOREIGN KEY ("escritorio_id") REFERENCES "public"."escritorios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Processos são dados do escritório: mesmo isolamento por RLS de espacos_trabalho (migração 0001).
GRANT SELECT, INSERT, UPDATE, DELETE ON processos TO sentinela_app;
--> statement-breakpoint
ALTER TABLE processos ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE processos FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY processos_do_escritorio ON processos TO sentinela_app
  USING (escritorio_id = nullif(current_setting('app.escritorio_id', true), '')::uuid)
  WITH CHECK (escritorio_id = nullif(current_setting('app.escritorio_id', true), '')::uuid);
--> statement-breakpoint
-- Sem acesso para os papéis que o Supabase expõe pela API de dados.
DO $$
DECLARE papel text;
BEGIN
  FOREACH papel IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = papel) THEN
      EXECUTE format('REVOKE ALL ON processos FROM %I', papel);
    END IF;
  END LOOP;
END
$$;
