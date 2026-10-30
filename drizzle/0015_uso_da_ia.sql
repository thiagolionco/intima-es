CREATE TABLE "uso_ia" (
	"id" uuid PRIMARY KEY NOT NULL,
	"escritorio_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"funcao" text NOT NULL,
	"modelo" text NOT NULL,
	"entrada" integer NOT NULL,
	"saida" integer NOT NULL,
	"cache_escrita" integer NOT NULL,
	"cache_leitura" integer NOT NULL,
	"buscas_web" integer NOT NULL,
	"criado_em" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "uso_ia" ADD CONSTRAINT "uso_ia_escritorio_id_escritorios_id_fk" FOREIGN KEY ("escritorio_id") REFERENCES "public"."escritorios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "uso_ia_escritorio_idx" ON "uso_ia" USING btree ("escritorio_id","criado_em");--> statement-breakpoint
-- Uso da IA por escritório (base das cotas por plano). Só acrescenta (tabela e políticas novas);
-- nada que já existe é alterado ou apagado. Sem UPDATE nem DELETE: o registro só cresce.
GRANT SELECT, INSERT ON uso_ia TO sentinela_app;
--> statement-breakpoint
ALTER TABLE uso_ia ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE uso_ia FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY uso_ia_do_escritorio ON uso_ia TO sentinela_app
  USING (escritorio_id = nullif(current_setting('app.escritorio_id', true), '')::uuid)
  WITH CHECK (escritorio_id = nullif(current_setting('app.escritorio_id', true), '')::uuid);
--> statement-breakpoint
-- O administrador da plataforma lê o uso de todos os escritórios (mesma função da 0009). Só leitura.
CREATE POLICY uso_ia_leitura_administrador ON uso_ia FOR SELECT TO sentinela_app
  USING (app_usuario_e_administrador());
--> statement-breakpoint
-- Sem acesso para os papéis que o Supabase expõe pela API de dados.
DO $$
DECLARE papel text;
BEGIN
  FOREACH papel IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = papel) THEN
      EXECUTE format('REVOKE ALL ON uso_ia FROM %I', papel);
    END IF;
  END LOOP;
END
$$;
