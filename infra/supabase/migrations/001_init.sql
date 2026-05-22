-- ============================================================
-- 001_init.sql — tables, RLS, auth trigger, Realtime
-- Run in Supabase Dashboard → SQL Editor
-- ============================================================

-- Auth trigger: auto-create profile row when user signs up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (new.id)
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── Tables ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan text DEFAULT 'trial',
  trial_ends timestamptz,
  timezone text DEFAULT 'Asia/Almaty',
  tg_chat_id bigint,
  created_at timestamptz DEFAULT now()
);

-- DENY ALL for anon+authenticated — no RLS policies will be created for this table
CREATE TABLE IF NOT EXISTS hh_credentials (
  user_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  access_token_encrypted text,
  refresh_token_encrypted text,
  expires_at timestamptz,
  hh_user_id text,
  last_refreshed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS resumes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  hh_resume_id text NOT NULL,
  title text,
  status text,
  synced_at timestamptz,
  UNIQUE(user_id, hh_resume_id)
);

CREATE TABLE IF NOT EXISTS filters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  resume_id uuid REFERENCES resumes(id) ON DELETE CASCADE,
  text text,
  area int,
  salary_min int,
  experience text,
  schedule text,
  employment text,
  professional_role int[],
  excluded_regex text,
  enabled bool DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  resume_id uuid REFERENCES resumes(id),
  vacancy_id text NOT NULL,
  employer_id text,
  status text DEFAULT 'queued',
  cover_letter text,
  applied_at timestamptz,
  error text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, vacancy_id)
);

CREATE TABLE IF NOT EXISTS apply_counters (
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  date date NOT NULL,
  count int DEFAULT 0,
  PRIMARY KEY (user_id, date)
);

CREATE TABLE IF NOT EXISTS blacklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  employer_id text NOT NULL,
  employer_name text,
  reason text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, employer_id)
);

CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  provider_payment_id text UNIQUE NOT NULL,
  amount int,
  provider text DEFAULT 'cloudpayments',
  status text DEFAULT 'pending',
  expires_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS captcha_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  storage_path text,
  captcha_url text,
  solved bool DEFAULT false,
  created_at timestamptz DEFAULT now(),
  solved_at timestamptz
);

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  type text,
  payload jsonb,
  read bool DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vacancy_cache (
  vacancy_id text PRIMARY KEY,
  payload jsonb,
  fetched_at timestamptz DEFAULT now()
);

-- ─── Auth trigger ─────────────────────────────────────────────

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE handle_new_user();

-- ─── Row Level Security ───────────────────────────────────────

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE hh_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE resumes ENABLE ROW LEVEL SECURITY;
ALTER TABLE filters ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE apply_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE blacklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE captcha_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE vacancy_cache ENABLE ROW LEVEL SECURITY;

-- profiles: user reads/writes own row
CREATE POLICY "profiles_select_own" ON profiles
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- hh_credentials: NO policies = DENY ALL for anon+authenticated
-- service_role bypasses RLS entirely (Supabase default)

-- resumes: user reads own only
CREATE POLICY "resumes_select_own" ON resumes
  FOR SELECT USING (auth.uid() = user_id);

-- filters: user reads own only
CREATE POLICY "filters_select_own" ON filters
  FOR SELECT USING (auth.uid() = user_id);

-- applications: user reads own only
CREATE POLICY "applications_select_own" ON applications
  FOR SELECT USING (auth.uid() = user_id);

-- apply_counters: no policies (service_role only)

-- blacklist: user reads own only
CREATE POLICY "blacklist_select_own" ON blacklist
  FOR SELECT USING (auth.uid() = user_id);

-- payments: no policies (service_role only)

-- captcha_requests: user reads own only
CREATE POLICY "captcha_requests_select_own" ON captcha_requests
  FOR SELECT USING (auth.uid() = user_id);

-- notifications: user reads own only, user can mark as read
CREATE POLICY "notifications_select_own" ON notifications
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "notifications_update_own" ON notifications
  FOR UPDATE USING (auth.uid() = user_id);

-- vacancy_cache: no policies (service_role only)

-- ─── Realtime ─────────────────────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE applications;
ALTER PUBLICATION supabase_realtime ADD TABLE captcha_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
