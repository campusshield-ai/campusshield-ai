-- Server-created Paystack orders are pending until a signed webhook and transaction verification confirm payment.
CREATE TABLE IF NOT EXISTS public.shieldmind_payment_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan text NOT NULL CHECK (plan IN ('starter','plus','pro','ultra','max')),
  billing_period text NOT NULL DEFAULT 'monthly' CHECK (billing_period IN ('monthly')),
  amount_kobo integer NOT NULL CHECK (amount_kobo > 0),
  currency text NOT NULL DEFAULT 'NGN' CHECK (currency = 'NGN'),
  provider text NOT NULL DEFAULT 'paystack' CHECK (provider = 'paystack'),
  provider_reference text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed','abandoned')),
  authorization_url text,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.shieldmind_payment_orders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.shieldmind_payment_orders FROM anon, authenticated;
GRANT SELECT ON public.shieldmind_payment_orders TO authenticated;
DROP POLICY IF EXISTS shieldmind_payment_orders_read_own ON public.shieldmind_payment_orders;
CREATE POLICY shieldmind_payment_orders_read_own ON public.shieldmind_payment_orders FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE INDEX IF NOT EXISTS shieldmind_payment_orders_user_created_idx ON public.shieldmind_payment_orders(user_id, created_at DESC);
