-- 0001: extensões e funções auxiliares.
-- PostGIS exige privilégio de superusuário (ou extensão pré-criada por um DBA em bancos gerenciados).
CREATE EXTENSION IF NOT EXISTS postgis;

-- Mantém updated_at coerente sem depender da aplicação.
CREATE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Tabelas de histórico (auditoria, eventos) são append-only: nada de UPDATE/DELETE.
CREATE FUNCTION forbid_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'A tabela % é append-only (operação % não permitida)', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$;
