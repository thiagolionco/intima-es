CREATE TABLE "escritorio_registros" (
	"id" uuid PRIMARY KEY NOT NULL,
	"escritorio_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"processo_id" uuid,
	"dono_id" uuid,
	"valor" jsonb NOT NULL,
	"criado_em" timestamp with time zone NOT NULL,
	"atualizado_em" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "escritorio_registros" ADD CONSTRAINT "escritorio_registros_escritorio_id_escritorios_id_fk" FOREIGN KEY ("escritorio_id") REFERENCES "public"."escritorios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escritorio_registros" ADD CONSTRAINT "escritorio_registros_processo_id_processos_id_fk" FOREIGN KEY ("processo_id") REFERENCES "public"."processos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escritorio_registros" ADD CONSTRAINT "escritorio_registros_dono_id_usuarios_id_fk" FOREIGN KEY ("dono_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "escritorio_registros_tipo_idx" ON "escritorio_registros" USING btree ("escritorio_id","tipo");--> statement-breakpoint
CREATE INDEX "escritorio_registros_processo_idx" ON "escritorio_registros" USING btree ("processo_id");--> statement-breakpoint
-- Registros por tipo das ferramentas novas. Só acrescenta (tabela e políticas novas); nada que já
-- existe é alterado ou apagado. Mesmo isolamento por escritório da biblioteca (0013).
GRANT SELECT, INSERT, UPDATE, DELETE ON escritorio_registros TO sentinela_app;
--> statement-breakpoint
ALTER TABLE escritorio_registros ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE escritorio_registros FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY registros_do_escritorio ON escritorio_registros TO sentinela_app
  USING (escritorio_id = nullif(current_setting('app.escritorio_id', true), '')::uuid)
  WITH CHECK (escritorio_id = nullif(current_setting('app.escritorio_id', true), '')::uuid);
--> statement-breakpoint
-- O que pende de um processo segue a visibilidade dele (processo particular de outra pessoa não existe).
CREATE POLICY registros_de_processo_visivel ON escritorio_registros AS RESTRICTIVE TO sentinela_app
  USING (processo_id IS NULL OR EXISTS (SELECT 1 FROM processos p WHERE p.id = processo_id))
  WITH CHECK (processo_id IS NULL OR EXISTS (SELECT 1 FROM processos p WHERE p.id = processo_id));
--> statement-breakpoint
-- Registro pessoal (dono_id preenchido): só a própria pessoa vê.
CREATE POLICY registros_pessoais ON escritorio_registros AS RESTRICTIVE TO sentinela_app
  USING (dono_id IS NULL OR dono_id = nullif(current_setting('app.usuario_id', true), '')::uuid)
  WITH CHECK (dono_id IS NULL OR dono_id = nullif(current_setting('app.usuario_id', true), '')::uuid);
--> statement-breakpoint
-- Sem acesso para os papéis que o Supabase expõe pela API de dados.
DO $$
DECLARE papel text;
BEGIN
  FOREACH papel IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = papel) THEN
      EXECUTE format('REVOKE ALL ON escritorio_registros FROM %I', papel);
    END IF;
  END LOOP;
END
$$;
