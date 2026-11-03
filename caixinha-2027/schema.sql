-- Caixinha 2027: dados separados dos lançamentos e da rifa de 2026.
-- Executar em banco Neon privado após revisão, uma única vez. Não contém dados reais.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS cx27;
REVOKE ALL ON SCHEMA cx27 FROM PUBLIC;


CREATE TABLE IF NOT EXISTS cx27.members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name varchar(120) NOT NULL,
  cpf_hmac char(64) NOT NULL UNIQUE,
  cpf_last4 char(4) NOT NULL,
  phone varchar(15) NOT NULL,
  address varchar(240) NOT NULL,
  password_salt char(32) NOT NULL,
  password_hash char(128) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active','blocked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  approved_by text
);

CREATE TABLE IF NOT EXISTS cx27.sessions (
  token_hash char(64) PRIMARY KEY,
  member_id uuid NOT NULL REFERENCES cx27.members(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cx27_sessions_member_idx ON cx27.sessions(member_id);

CREATE TABLE IF NOT EXISTS cx27.receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES cx27.members(id),
  paid_on date NOT NULL CHECK(paid_on BETWEEN '2027-01-01' AND '2027-12-31'),
  amount_cents integer NOT NULL CHECK(amount_cents BETWEEN 1 AND 20000000),
  allocations jsonb NOT NULL,
  notes varchar(800) NOT NULL DEFAULT '',
  mime varchar(32) NOT NULL CHECK(mime IN ('image/png','image/jpeg','application/pdf')),
  filename varchar(100) NOT NULL,
  file_bytes bytea NOT NULL,
  file_sha256 char(64) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  review_notes varchar(500),
  reviewed_by text,
  reviewed_at timestamptz,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(member_id,file_sha256,amount_cents)
);
CREATE INDEX IF NOT EXISTS cx27_receipts_member_idx ON cx27.receipts(member_id,submitted_at DESC);
CREATE INDEX IF NOT EXISTS cx27_receipts_status_idx ON cx27.receipts(status,submitted_at DESC);

CREATE TABLE IF NOT EXISTS cx27.ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES cx27.members(id),
  receipt_id uuid NOT NULL REFERENCES cx27.receipts(id),
  line_index smallint NOT NULL CHECK(line_index BETWEEN 0 AND 19),
  category varchar(40) NOT NULL,
  amount_cents integer NOT NULL CHECK(amount_cents > 0),
  competence varchar(7),
  event_name varchar(90),
  approved_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(receipt_id,line_index)
);
CREATE INDEX IF NOT EXISTS cx27_ledger_member_idx ON cx27.ledger(member_id,created_at DESC);

CREATE TABLE IF NOT EXISTS cx27.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title varchar(120) NOT NULL,
  description varchar(500) NOT NULL DEFAULT '',
  event_date date,
  total_numbers integer NOT NULL CHECK(total_numbers BETWEEN 1 AND 500),
  status varchar(12) NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS cx27.event_numbers (
  event_id uuid NOT NULL REFERENCES cx27.events(id),
  number integer NOT NULL CHECK(number BETWEEN 1 AND 500),
  member_id uuid NOT NULL REFERENCES cx27.members(id),
  chosen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(event_id,number)
);
CREATE INDEX IF NOT EXISTS cx27_event_member_idx ON cx27.event_numbers(member_id,event_id);

-- Defesa adicional contra acesso indevido por outros papéis SQL ou APIs de dados.
REVOKE ALL ON ALL TABLES IN SCHEMA cx27 FROM PUBLIC;
