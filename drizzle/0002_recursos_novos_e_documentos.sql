CREATE TABLE "documentos" (
	"chave" text PRIMARY KEY NOT NULL,
	"valor" jsonb NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "espacos_trabalho" ADD COLUMN "suspensoes" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "espacos_trabalho" ADD COLUMN "preferencias" jsonb;--> statement-breakpoint
-- Documentos soltos (Google Agenda, avisos): como as tabelas de identidade, RLS ligado e sem política,
-- e sem acesso para os papéis que o Supabase expõe pela API de dados.
ALTER TABLE documentos ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$
DECLARE papel text;
BEGIN
  FOREACH papel IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = papel) THEN
      EXECUTE format('REVOKE ALL ON documentos FROM %I', papel);
    END IF;
  END LOOP;
END
$$;
