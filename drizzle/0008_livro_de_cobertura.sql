CREATE TABLE "registro_cobertura" (
	"escritorio_id" uuid NOT NULL,
	"termo_id" text NOT NULL,
	"dia" date NOT NULL,
	"estado" text NOT NULL,
	"lidos" integer NOT NULL,
	"esperados" integer,
	"latencia_ms" integer,
	"erro" text,
	"tentativas" integer NOT NULL,
	"verificado_em" timestamp with time zone NOT NULL,
	CONSTRAINT "registro_cobertura_escritorio_id_termo_id_dia_pk" PRIMARY KEY("escritorio_id","termo_id","dia")
);
--> statement-breakpoint
ALTER TABLE "registro_cobertura" ADD CONSTRAINT "registro_cobertura_escritorio_id_escritorios_id_fk" FOREIGN KEY ("escritorio_id") REFERENCES "public"."escritorios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "registro_cobertura_dia_idx" ON "registro_cobertura" USING btree ("escritorio_id","dia");--> statement-breakpoint
ALTER TABLE registro_cobertura ADD CONSTRAINT registro_cobertura_estado_valido
  CHECK (estado IN ('NAO_VERIFICADO', 'VERIFICADO_COM_RESULTADOS', 'VERIFICADO_SEM_RESULTADOS', 'PARCIAL', 'FALHOU'));
--> statement-breakpoint
-- Cobertura é dado do escritório: mesmo isolamento por RLS de processos (migração 0003).
-- DELETE porque o app poda os dias com mais de 90 dias.
GRANT SELECT, INSERT, UPDATE, DELETE ON registro_cobertura TO sentinela_app;
--> statement-breakpoint
ALTER TABLE registro_cobertura ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE registro_cobertura FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY cobertura_do_escritorio ON registro_cobertura TO sentinela_app
  USING (escritorio_id = nullif(current_setting('app.escritorio_id', true), '')::uuid)
  WITH CHECK (escritorio_id = nullif(current_setting('app.escritorio_id', true), '')::uuid);
--> statement-breakpoint
-- Sem acesso para os papéis que o Supabase expõe pela API de dados.
DO $$
DECLARE papel text;
BEGIN
  FOREACH papel IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = papel) THEN
      EXECUTE format('REVOKE ALL ON registro_cobertura FROM %I', papel);
    END IF;
  END LOOP;
END
$$;
