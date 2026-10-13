ALTER TABLE "usuarios" ADD COLUMN "administrador" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "desativado_em" timestamp with time zone;--> statement-breakpoint
-- Administração da plataforma.
--
-- O administrador lê as contas de todos os escritórios. A exceção ao isolamento fica no banco:
-- as políticas abaixo só liberam a leitura de escritórios e membros quando o app.usuario_id da
-- transação é, de fato, um administrador ativo na tabela usuarios. O papel sentinela_app não lê
-- usuarios, então a checagem roda numa função SECURITY DEFINER (com os direitos do dono).
-- Ninguém fora do dono das tabelas consegue marcar uma conta como administradora.
DO $$
BEGIN
  EXECUTE format($f$
    CREATE OR REPLACE FUNCTION app_usuario_e_administrador() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = %I, pg_temp
    AS $corpo$
      SELECT coalesce((
        SELECT administrador AND desativado_em IS NULL
        FROM usuarios
        WHERE id = nullif(current_setting('app.usuario_id', true), '')::uuid
      ), false)
    $corpo$
  $f$, current_schema());
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_usuario_e_administrador() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_usuario_e_administrador() TO sentinela_app;
--> statement-breakpoint
-- Só leitura: o administrador não grava nada dentro dos escritórios pelo papel restrito.
CREATE POLICY escritorios_leitura_administrador ON escritorios FOR SELECT TO sentinela_app
  USING (app_usuario_e_administrador());
--> statement-breakpoint
CREATE POLICY membros_leitura_administrador ON membros FOR SELECT TO sentinela_app
  USING (app_usuario_e_administrador());
--> statement-breakpoint
-- No Supabase, funções novas ganham EXECUTE para os papéis da API de dados por padrão. Tira.
DO $$
DECLARE papel text;
BEGIN
  FOREACH papel IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = papel) THEN
      EXECUTE format('REVOKE ALL ON FUNCTION app_usuario_e_administrador() FROM %I', papel);
    END IF;
  END LOOP;
END
$$;
