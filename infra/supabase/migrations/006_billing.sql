-- Day 19: CloudPayments billing.
-- payments table already exists (001_init). Add subscription correlation + plan
-- expiry tracking on profiles so the webhook can activate a paid plan.

-- Correlate recurring charges back to their CloudPayments subscription.
ALTER TABLE payments ADD COLUMN IF NOT EXISTS subscription_id text;

-- Paid-plan state set by the webhook on a successful charge.
-- plan_expires_at = end of the paid period; plan gating (day 20) reads it.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS plan_expires_at timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cp_subscription_id text;

-- Webhook idempotency relies on payments.provider_payment_id UNIQUE (already
-- declared in 001_init). No extra index needed.
