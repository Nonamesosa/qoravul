/*
# Anti-Fraud Engine — Full Database Schema

## Overview
Creates the complete database schema for the Anti-Fraud Engine MVP platform,
including team management with RBAC, transaction events, scoring decisions,
fraud rules with DSL, case management, ML feedback labels, model versions,
audit logging, webhook configuration, and notifications.

## New Tables
1. `team_users` — Extends Supabase auth with role, full name, language preference
2. `events` — Transaction/login events submitted for scoring (pseudonymized)
3. `decisions` — Scoring decisions (ALLOW/CHALLENGE/BLOCK) with risk score, reason codes
4. `rules` — Fraud detection rules in JSON DSL format with versioning and 4-eyes approval
5. `cases` — Analyst review cases created from CHALLENGE/BLOCK decisions
6. `labels` — Feedback labels (confirmed_fraud/legitimate) for ML training
7. `model_versions` — ML model versions with champion/challenger tracking
8. `audit_log` — Audit trail for all admin and decision changes
9. `webhooks` — Webhook endpoint configurations for event delivery
10. `notifications` — Customer notifications (SMS/push) sent for CHALLENGE events

## Security
- RLS enabled on all tables
- All tables scoped to `authenticated` users (sign-in required)
- A `user_role()` helper function returns the current user's role from team_users
- Read access: all authenticated users can read all data (team-wide visibility)
- Write access: role-based restrictions enforced via policies
*/

-- ============================================
-- 1. team_users table (created first, no FK dependencies)
-- ============================================
CREATE TABLE IF NOT EXISTS public.team_users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text NOT NULL,
  role text NOT NULL DEFAULT 'analyst'
    CHECK (role IN ('admin', 'fraud_manager', 'analyst', 'data_scientist', 'auditor')),
  language text NOT NULL DEFAULT 'uz'
    CHECK (language IN ('uz', 'ru', 'en')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Helper function: returns current user's role (must exist before any policy uses it)
CREATE OR REPLACE FUNCTION public.user_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.team_users WHERE id = auth.uid();
$$;

-- Now create policies on team_users
ALTER TABLE public.team_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "team_users_select_all" ON public.team_users;
CREATE POLICY "team_users_select_all" ON public.team_users
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "team_users_insert_self" ON public.team_users;
CREATE POLICY "team_users_insert_self" ON public.team_users
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "team_users_update_self_or_admin" ON public.team_users;
CREATE POLICY "team_users_update_self_or_admin" ON public.team_users
  FOR UPDATE TO authenticated
  USING (auth.uid() = id OR public.user_role() = 'admin')
  WITH CHECK (auth.uid() = id OR public.user_role() = 'admin');

DROP POLICY IF EXISTS "team_users_delete_admin" ON public.team_users;
CREATE POLICY "team_users_delete_admin" ON public.team_users
  FOR DELETE TO authenticated USING (public.user_role() = 'admin');

-- ============================================
-- 2. events
-- ============================================
CREATE TABLE IF NOT EXISTS public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id varchar(64) UNIQUE NOT NULL,
  tenant_id varchar(100) NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('transfer', 'login', 'loan_application', 'card_payment')),
  customer_id_hash varchar(64),
  amount_uzs numeric(18,2),
  currency char(3) DEFAULT 'UZS',
  counterparty_hash varchar(64),
  card_token varchar(64),
  device_id_hash varchar(64),
  ip_address inet,
  geo_country char(2),
  geo_city varchar(100),
  channel varchar(50),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  received_at timestamptz NOT NULL DEFAULT now(),
  customer_ref varchar(100),
  account_age_days int,
  is_new_device boolean DEFAULT false,
  os varchar(20),
  app_version varchar(20),
  is_rooted boolean DEFAULT false,
  failed_logins_last_hour int DEFAULT 0,
  raw_request jsonb
);

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "events_select_all" ON public.events;
CREATE POLICY "events_select_all" ON public.events
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "events_insert_all" ON public.events;
CREATE POLICY "events_insert_all" ON public.events
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "events_update_manager" ON public.events;
CREATE POLICY "events_update_manager" ON public.events
  FOR UPDATE TO authenticated
  USING (public.user_role() IN ('admin', 'fraud_manager'))
  WITH CHECK (public.user_role() IN ('admin', 'fraud_manager'));

CREATE INDEX IF NOT EXISTS idx_events_request_id ON public.events(request_id);
CREATE INDEX IF NOT EXISTS idx_events_tenant ON public.events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_events_occurred_at ON public.events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_customer_hash ON public.events(customer_id_hash);

-- ============================================
-- 3. decisions
-- ============================================
CREATE TABLE IF NOT EXISTS public.decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES public.events(id) ON DELETE CASCADE,
  request_id varchar(64) NOT NULL,
  decision text NOT NULL CHECK (decision IN ('ALLOW', 'CHALLENGE', 'BLOCK')),
  risk_score smallint NOT NULL CHECK (risk_score >= 0 AND risk_score <= 1000),
  model_version varchar(32),
  rules_fired jsonb DEFAULT '[]'::jsonb,
  reason_codes jsonb DEFAULT '[]'::jsonb,
  feature_snapshot jsonb,
  degraded boolean NOT NULL DEFAULT false,
  latency_ms int,
  decided_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.decisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "decisions_select_all" ON public.decisions;
CREATE POLICY "decisions_select_all" ON public.decisions
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "decisions_insert_all" ON public.decisions;
CREATE POLICY "decisions_insert_all" ON public.decisions
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "decisions_update_manager" ON public.decisions;
CREATE POLICY "decisions_update_manager" ON public.decisions
  FOR UPDATE TO authenticated
  USING (public.user_role() IN ('admin', 'fraud_manager'))
  WITH CHECK (public.user_role() IN ('admin', 'fraud_manager'));

CREATE INDEX IF NOT EXISTS idx_decisions_event_id ON public.decisions(event_id);
CREATE INDEX IF NOT EXISTS idx_decisions_decision ON public.decisions(decision);
CREATE INDEX IF NOT EXISTS idx_decisions_decided_at ON public.decisions(decided_at DESC);

-- ============================================
-- 4. rules
-- ============================================
CREATE TABLE IF NOT EXISTS public.rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(200) NOT NULL,
  version int NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'shadow', 'active', 'disabled')),
  definition jsonb NOT NULL DEFAULT '{}'::jsonb,
  action text NOT NULL CHECK (action IN ('ALLOW', 'CHALLENGE', 'BLOCK')),
  reason_code varchar(100),
  owner varchar(100) DEFAULT 'fraud_team',
  created_by uuid REFERENCES public.team_users(id),
  approved_by uuid REFERENCES public.team_users(id),
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rules_select_all" ON public.rules;
CREATE POLICY "rules_select_all" ON public.rules
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "rules_insert_manager" ON public.rules;
CREATE POLICY "rules_insert_manager" ON public.rules
  FOR INSERT TO authenticated
  WITH CHECK (public.user_role() IN ('admin', 'fraud_manager'));

DROP POLICY IF EXISTS "rules_update_manager" ON public.rules;
CREATE POLICY "rules_update_manager" ON public.rules
  FOR UPDATE TO authenticated
  USING (public.user_role() IN ('admin', 'fraud_manager'))
  WITH CHECK (public.user_role() IN ('admin', 'fraud_manager'));

DROP POLICY IF EXISTS "rules_delete_admin" ON public.rules;
CREATE POLICY "rules_delete_admin" ON public.rules
  FOR DELETE TO authenticated USING (public.user_role() = 'admin');

CREATE INDEX IF NOT EXISTS idx_rules_status ON public.rules(status);

-- ============================================
-- 5. cases
-- ============================================
CREATE TABLE IF NOT EXISTS public.cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id uuid REFERENCES public.decisions(id) ON DELETE CASCADE,
  event_id uuid REFERENCES public.events(id) ON DELETE CASCADE,
  priority smallint NOT NULL DEFAULT 50 CHECK (priority >= 0 AND priority <= 100),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_review', 'closed')),
  assignee_id uuid REFERENCES public.team_users(id),
  sla_due_at timestamptz,
  outcome text CHECK (outcome IN ('confirmed_fraud', 'legitimate', 'unsure')),
  analyst_note text,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cases_select_all" ON public.cases;
CREATE POLICY "cases_select_all" ON public.cases
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "cases_insert_all" ON public.cases;
CREATE POLICY "cases_insert_all" ON public.cases
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "cases_update_all" ON public.cases;
CREATE POLICY "cases_update_all" ON public.cases
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "cases_delete_admin" ON public.cases;
CREATE POLICY "cases_delete_admin" ON public.cases
  FOR DELETE TO authenticated USING (public.user_role() = 'admin');

CREATE INDEX IF NOT EXISTS idx_cases_status ON public.cases(status);
CREATE INDEX IF NOT EXISTS idx_cases_priority ON public.cases(priority DESC);
CREATE INDEX IF NOT EXISTS idx_cases_assignee ON public.cases(assignee_id);
CREATE INDEX IF NOT EXISTS idx_cases_sla ON public.cases(sla_due_at);

-- ============================================
-- 6. labels
-- ============================================
CREATE TABLE IF NOT EXISTS public.labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES public.events(id) ON DELETE CASCADE,
  label smallint NOT NULL CHECK (label IN (0, 1)),
  source text NOT NULL CHECK (source IN ('analyst', 'chargeback', 'customer_report', 'rule')),
  labeled_by uuid REFERENCES public.team_users(id),
  labeled_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.labels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "labels_select_all" ON public.labels;
CREATE POLICY "labels_select_all" ON public.labels
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "labels_insert_all" ON public.labels;
CREATE POLICY "labels_insert_all" ON public.labels
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "labels_delete_admin" ON public.labels;
CREATE POLICY "labels_delete_admin" ON public.labels
  FOR DELETE TO authenticated USING (public.user_role() = 'admin');

CREATE INDEX IF NOT EXISTS idx_labels_event_id ON public.labels(event_id);

-- ============================================
-- 7. model_versions
-- ============================================
CREATE TABLE IF NOT EXISTS public.model_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version varchar(32) UNIQUE NOT NULL,
  algorithm varchar(50) NOT NULL DEFAULT 'lightgbm',
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'shadow', 'champion', 'retired')),
  training_data_size int,
  pr_auc numeric(6,4),
  recall numeric(6,4),
  fpr numeric(6,4),
  features_count int DEFAULT 60,
  notes text,
  created_by uuid REFERENCES public.team_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz
);

ALTER TABLE public.model_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "model_versions_select_all" ON public.model_versions;
CREATE POLICY "model_versions_select_all" ON public.model_versions
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "model_versions_insert_ds" ON public.model_versions;
CREATE POLICY "model_versions_insert_ds" ON public.model_versions
  FOR INSERT TO authenticated
  WITH CHECK (public.user_role() IN ('admin', 'data_scientist', 'fraud_manager'));

DROP POLICY IF EXISTS "model_versions_update_ds" ON public.model_versions;
CREATE POLICY "model_versions_update_ds" ON public.model_versions
  FOR UPDATE TO authenticated
  USING (public.user_role() IN ('admin', 'data_scientist', 'fraud_manager'))
  WITH CHECK (public.user_role() IN ('admin', 'data_scientist', 'fraud_manager'));

DROP POLICY IF EXISTS "model_versions_delete_admin" ON public.model_versions;
CREATE POLICY "model_versions_delete_admin" ON public.model_versions
  FOR DELETE TO authenticated USING (public.user_role() = 'admin');

-- ============================================
-- 8. audit_log
-- ============================================
CREATE TABLE IF NOT EXISTS public.audit_log (
  id bigserial PRIMARY KEY,
  actor_id uuid REFERENCES public.team_users(id),
  action varchar(100) NOT NULL,
  entity varchar(50) NOT NULL,
  entity_id uuid,
  diff jsonb,
  ip_address inet,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_log_select_all" ON public.audit_log;
CREATE POLICY "audit_log_select_all" ON public.audit_log
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "audit_log_insert_all" ON public.audit_log;
CREATE POLICY "audit_log_insert_all" ON public.audit_log
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON public.audit_log(entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON public.audit_log(created_at DESC);

-- ============================================
-- 9. webhooks
-- ============================================
CREATE TABLE IF NOT EXISTS public.webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(100) NOT NULL,
  url text NOT NULL,
  events jsonb NOT NULL DEFAULT '["case.created", "case.closed", "decision.block"]'::jsonb,
  secret varchar(128),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.webhooks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "webhooks_select_all" ON public.webhooks;
CREATE POLICY "webhooks_select_all" ON public.webhooks
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "webhooks_insert_admin" ON public.webhooks;
CREATE POLICY "webhooks_insert_admin" ON public.webhooks
  FOR INSERT TO authenticated
  WITH CHECK (public.user_role() IN ('admin', 'fraud_manager'));

DROP POLICY IF EXISTS "webhooks_update_admin" ON public.webhooks;
CREATE POLICY "webhooks_update_admin" ON public.webhooks
  FOR UPDATE TO authenticated
  USING (public.user_role() IN ('admin', 'fraud_manager'))
  WITH CHECK (public.user_role() IN ('admin', 'fraud_manager'));

DROP POLICY IF EXISTS "webhooks_delete_admin" ON public.webhooks;
CREATE POLICY "webhooks_delete_admin" ON public.webhooks
  FOR DELETE TO authenticated USING (public.user_role() = 'admin');

-- ============================================
-- 10. notifications
-- ============================================
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid REFERENCES public.cases(id) ON DELETE CASCADE,
  decision_id uuid REFERENCES public.decisions(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('sms', 'push', 'email')),
  language text NOT NULL DEFAULT 'uz' CHECK (language IN ('uz', 'ru', 'en')),
  message text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'delivered', 'failed')),
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_select_all" ON public.notifications;
CREATE POLICY "notifications_select_all" ON public.notifications
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "notifications_insert_all" ON public.notifications;
CREATE POLICY "notifications_insert_all" ON public.notifications
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "notifications_update_admin" ON public.notifications;
CREATE POLICY "notifications_update_admin" ON public.notifications
  FOR UPDATE TO authenticated
  USING (public.user_role() IN ('admin', 'fraud_manager'))
  WITH CHECK (public.user_role() IN ('admin', 'fraud_manager'));

CREATE INDEX IF NOT EXISTS idx_notifications_case_id ON public.notifications(case_id);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON public.notifications(status);
