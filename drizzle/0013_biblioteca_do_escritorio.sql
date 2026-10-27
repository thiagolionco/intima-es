CREATE TABLE "biblioteca_itens" (
	"id" uuid PRIMARY KEY NOT NULL,
	"escritorio_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"titulo" text NOT NULL,
	"referencia" text,
	"tribunal" text,
	"area" text,
	"texto" text,
	"etiquetas" jsonb NOT NULL,
	"link" text,
	"arquivo" jsonb,
	"texto_arquivo" text,
	"autor_id" uuid NOT NULL,
	"autor_nome" text NOT NULL,
	"criado_em" timestamp with time zone NOT NULL,
	"atualizado_em" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "biblioteca_itens" ADD CONSTRAINT "biblioteca_itens_escritorio_id_escritorios_id_fk" FOREIGN KEY ("escritorio_id") REFERENCES "public"."escritorios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "biblioteca_itens_escritorio_idx" ON "biblioteca_itens" USING btree ("escritorio_id");--> statement-breakpoint
-- A biblioteca é do escritório: mesmo isolamento por RLS de processos (migração 0003).
-- Sem processo particular aqui: todo item é visto pela equipe inteira.
GRANT SELECT, INSERT, UPDATE, DELETE ON biblioteca_itens TO sentinela_app;
--> statement-breakpoint
ALTER TABLE biblioteca_itens ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE biblioteca_itens FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY biblioteca_do_escritorio ON biblioteca_itens TO sentinela_app
  USING (escritorio_id = nullif(current_setting('app.escritorio_id', true), '')::uuid)
  WITH CHECK (escritorio_id = nullif(current_setting('app.escritorio_id', true), '')::uuid);
--> statement-breakpoint
-- Sem acesso para os papéis que o Supabase expõe pela API de dados.
DO $$
DECLARE papel text;
BEGIN
  FOREACH papel IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = papel) THEN
      EXECUTE format('REVOKE ALL ON biblioteca_itens FROM %I', papel);
    END IF;
  END LOOP;
END
$$;
