CREATE TABLE "convites" (
	"id" uuid PRIMARY KEY NOT NULL,
	"escritorio_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"email" text NOT NULL,
	"papel" text NOT NULL,
	"pessoa_id" text,
	"convidado_por" uuid,
	"criado_em" timestamp with time zone NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	CONSTRAINT "convites_token_hash_key" UNIQUE("token_hash"),
	CONSTRAINT "convites_escritorio_email_key" UNIQUE("escritorio_id","email")
);
--> statement-breakpoint
ALTER TABLE "processos" ADD COLUMN "particular_de" uuid;--> statement-breakpoint
ALTER TABLE "convites" ADD CONSTRAINT "convites_escritorio_id_escritorios_id_fk" FOREIGN KEY ("escritorio_id") REFERENCES "public"."escritorios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "convites" ADD CONSTRAINT "convites_convidado_por_usuarios_id_fk" FOREIGN KEY ("convidado_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processos" ADD CONSTRAINT "processos_particular_de_usuarios_id_fk" FOREIGN KEY ("particular_de") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Equipe do escritório: convites e processos particulares. Só acrescenta (tabela, coluna e
-- políticas novas); nada que já existe é alterado ou apagado.
--
-- Convites: o app lê e grava pelo papel restrito, isolado por escritório. A busca pelo token (quem
-- abre o link ainda não está no escritório) roda na conexão do app, que é dona da tabela; por isso
-- o RLS aqui é ligado, mas não forçado, como nas tabelas de identidade.
GRANT SELECT, INSERT, UPDATE, DELETE ON convites TO sentinela_app;
--> statement-breakpoint
ALTER TABLE convites ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY convites_do_escritorio ON convites TO sentinela_app
  USING (escritorio_id = nullif(current_setting('app.escritorio_id', true), '')::uuid)
  WITH CHECK (escritorio_id = nullif(current_setting('app.escritorio_id', true), '')::uuid);
--> statement-breakpoint
-- Processo particular: além de ser do escritório (política processos_do_escritorio), só aparece
-- para a conta dona dele. RESTRICTIVE soma (E) com as políticas que já existem.
CREATE POLICY processos_particulares ON processos AS RESTRICTIVE TO sentinela_app
  USING (particular_de IS NULL OR particular_de = nullif(current_setting('app.usuario_id', true), '')::uuid)
  WITH CHECK (particular_de IS NULL OR particular_de = nullif(current_setting('app.usuario_id', true), '')::uuid);
--> statement-breakpoint
-- O que pende de um processo (PDFs, pareceres, análises, andamentos) segue a visibilidade dele: a
-- subconsulta em processos passa pelo RLS acima, então o processo particular de outra pessoa não existe.
CREATE POLICY documentos_de_processo_visivel ON processo_documentos AS RESTRICTIVE TO sentinela_app
  USING (EXISTS (SELECT 1 FROM processos p WHERE p.id = processo_id))
  WITH CHECK (EXISTS (SELECT 1 FROM processos p WHERE p.id = processo_id));
--> statement-breakpoint
CREATE POLICY pareceres_de_processo_visivel ON processo_pareceres AS RESTRICTIVE TO sentinela_app
  USING (EXISTS (SELECT 1 FROM processos p WHERE p.id = processo_id))
  WITH CHECK (EXISTS (SELECT 1 FROM processos p WHERE p.id = processo_id));
--> statement-breakpoint
CREATE POLICY analises_de_processo_visivel ON processo_analises AS RESTRICTIVE TO sentinela_app
  USING (EXISTS (SELECT 1 FROM processos p WHERE p.id = processo_id))
  WITH CHECK (EXISTS (SELECT 1 FROM processos p WHERE p.id = processo_id));
--> statement-breakpoint
CREATE POLICY movimentacoes_de_processo_visivel ON processo_movimentacoes AS RESTRICTIVE TO sentinela_app
  USING (EXISTS (SELECT 1 FROM processos p WHERE p.id = processo_id))
  WITH CHECK (EXISTS (SELECT 1 FROM processos p WHERE p.id = processo_id));
--> statement-breakpoint
-- Sem acesso para os papéis que o Supabase expõe pela API de dados.
DO $$
DECLARE papel text;
BEGIN
  FOREACH papel IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = papel) THEN
      EXECUTE format('REVOKE ALL ON convites FROM %I', papel);
    END IF;
  END LOOP;
END
$$;
