CREATE UNIQUE INDEX IF NOT EXISTS payments_txid_unique ON public.payments (lower(txid));

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email,'@',1)))
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user') ON CONFLICT DO NOTHING;
  IF lower(NEW.email) = 'admin@system.local' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin') ON CONFLICT DO NOTHING;
  END IF;
  INSERT INTO public.subscriptions (user_id, plan, credits_remaining)
  VALUES (NEW.id, 'free', 10) ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.credit_ledger (user_id, delta, reason) VALUES (NEW.id, 10, 'Welcome trial credits');
  RETURN NEW;
END;
$function$;

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin' FROM public.profiles WHERE lower(email) = 'admin@system.local'
ON CONFLICT DO NOTHING;