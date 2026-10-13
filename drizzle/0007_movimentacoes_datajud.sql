CREATE TABLE "processo_movimentacoes" (
	"processo_id" uuid PRIMARY KEY NOT NULL,
	"escritorio_id" uuid NOT NULL,
	"consultado_em" timestamp with time zone NOT NULL,
	"encontrado" boolean NOT NULL,
	"atualizado_no_tribunal" timestamp with time zone,
	"movimentos" jsonb NOT NULL,
	"erro" text,
	"ultima_em" timestamp with time zone,
	"ultima_nome" text
);
--> statement-breakpoint
ALTER TABLE "processo_movimentacoes" ADD CONSTRAINT "processo_movimentacoes_processo_id_processos_id_fk" FOREIGN KEY ("processo_id") REFERENCES "public"."processos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processo_movimentacoes" ADD CONSTRAINT "processo_movimentacoes_escritorio_id_escritorios_id_fk" FOREIGN KEY ("escritorio_id") REFERENCES "public"."escritorios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "processo_movimentacoes_escritorio_idx" ON "processo_movimentacoes" USING btree ("escritorio_id");--> statement-breakpoint
-- Andamentos do DataJud são dados do escritório: mesmo isolamento por RLS de processos (migração 0003).
-- UPDATE porque cada consulta regrava a linha do processo; DELETE fica só com o ON DELETE CASCADE.
GRANT SELECT, INSERT, UPDATE ON processo_movimentacoes TO sentinela_app;
--> statement-breakpoint
ALTER TABLE processo_movimentacoes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE processo_movimentacoes FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY movimentacoes_do_escritorio ON processo_movimentacoes TO sentinela_app
  USING (escritorio_id = nullif(current_setting('app.escritorio_id', true), '')::uuid)
  WITH CHECK (escritorio_id = nullif(current_setting('app.escritorio_id', true), '')::uuid);
--> statement-breakpoint
-- Sem acesso para os papéis que o Supabase expõe pela API de dados.
DO $$
DECLARE papel text;
BEGIN
  FOREACH papel IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = papel) THEN
      EXECUTE format('REVOKE ALL ON processo_movimentacoes FROM %I', papel);
    END IF;
  END LOOP;
END
$$;
