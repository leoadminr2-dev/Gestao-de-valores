CREATE TABLE IF NOT EXISTS refri_config (
 id boolean PRIMARY KEY DEFAULT true CHECK (id),
 encrypted_token text NOT NULL,
 seller_id text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS refri_accounts (
 member_id uuid PRIMARY KEY,
 trial_until timestamptz NOT NULL DEFAULT now() + interval '7 days',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS refri_subscriptions (
 id text PRIMARY KEY,
 member_id uuid NOT NULL REFERENCES refri_accounts(member_id),
 status text NOT NULL,
 checkout_url text,
 checked_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS refri_subscriptions_member ON refri_subscriptions(member_id);
CREATE TABLE IF NOT EXISTS refri_payments (
 id text PRIMARY KEY,
 subscription_id text NOT NULL REFERENCES refri_subscriptions(id),
 status text NOT NULL,
 paid_until timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE refri_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE refri_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE refri_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE refri_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON refri_config, refri_accounts, refri_subscriptions, refri_payments FROM PUBLIC;
