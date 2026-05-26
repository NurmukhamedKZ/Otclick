-- Day 20: trial logic + plan gating.
-- New signups get a 7-day trial. Plan gating (worker start / worker_main) reads
-- profiles.plan + trial_ends + plan_expires_at.

-- Set trial_ends on signup. profiles.plan already defaults to 'trial' (001_init);
-- the old trigger inserted only id, leaving trial_ends NULL = no trial window.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, plan, trial_ends)
  VALUES (new.id, 'trial', now() + interval '7 days')
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Backfill pre-existing trial users whose trial_ends was never set: give them
-- 7 days from their original signup.
UPDATE public.profiles
SET trial_ends = created_at + interval '7 days'
WHERE plan = 'trial' AND trial_ends IS NULL;
