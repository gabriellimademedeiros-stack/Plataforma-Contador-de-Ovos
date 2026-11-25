-- Parte 3.5: RLS habilitado em todas as tabelas do schema app, sem políticas.
-- Nega tudo para os papéis anon e authenticated do Supabase; o app conecta com o dono do banco.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'app' LOOP
    EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY', r.tablename);
  END LOOP;
END $$;
