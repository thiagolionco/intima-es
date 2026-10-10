-- Isolamento por escritório (Row-Level Security).
--
-- O app acessa as tabelas do escritório só com o papel sentinela_app, que não fura o RLS,
-- e só depois de gravar app.usuario_id e app.escritorio_id na transação (contexto.ts).
-- Sem esse contexto, as políticas não deixam ver nem gravar nada.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sentinela_app') THEN
    CREATE ROLE sentinela_app NOLOGIN NOBYPASSRLS;
  END IF;
END
$$;
--> statement-breakpoint
-- A conexão do app precisa poder assumir o papel (SET LOCAL ROLE sentinela_app).
GRANT sentinela_app TO CURRENT_USER;
--> statement-breakpoint
DO $$
BEGIN
  EXECUTE format('GRANT USAGE ON SCHEMA %I TO sentinela_app', current_schema());
END
$$;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON escritorios, membros, espacos_trabalho TO sentinela_app;
--> statement-breakpoint

-- Tabelas do escritório: RLS forçado (vale até para o dono das tabelas).
ALTER TABLE escritorios ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE escritorios FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE membros ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE membros FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE espacos_trabalho ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE espacos_trabalho FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY escritorio_proprio ON escritorios TO sentinela_app
  USING (id = nullif(current_setting('app.escritorio_id', true), '')::uuid)
  WITH CHECK (id = nullif(current_setting('app.escritorio_id', true), '')::uuid);
--> statement-breakpoint
-- O usuário enxerga as próprias filiações (para descobrir o escritório) e os membros do escritório atual.
CREATE POLICY membros_do_escritorio ON membros TO sentinela_app
  USING (
    escritorio_id = nullif(current_setting('app.escritorio_id', true), '')::uuid
    OR usuario_id = nullif(current_setting('app.usuario_id', true), '')::uuid
  )
  WITH CHECK (escritorio_id = nullif(current_setting('app.escritorio_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY espaco_do_escritorio ON espacos_trabalho TO sentinela_app
  USING (escritorio_id = nullif(current_setting('app.escritorio_id', true), '')::uuid)
  WITH CHECK (escritorio_id = nullif(current_setting('app.escritorio_id', true), '')::uuid);
--> statement-breakpoint

-- Tabelas de identidade: RLS ligado e sem política. Só o dono das tabelas (a conexão do app)
-- as lê; qualquer outro papel (por exemplo anon e authenticated, que o Supabase expõe pela
-- API de dados) não vê nada.
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE sessoes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tokens_verificacao ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE desafios_dois_fatores ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE auditoria ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- No Supabase, os papéis da API de dados recebem acesso a tabelas novas por padrão. Tira.
DO $$
DECLARE papel text;
BEGIN
  FOREACH papel IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = papel) THEN
      EXECUTE format(
        'REVOKE ALL ON usuarios, sessoes, tokens_verificacao, desafios_dois_fatores, auditoria, escritorios, membros, espacos_trabalho FROM %I',
        papel
      );
    END IF;
  END LOOP;
END
$$;
