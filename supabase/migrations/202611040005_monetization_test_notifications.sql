-- MARKETLY PHASE 05A -- apply ONCE after migration 004.
-- All payment activity in this migration is strictly simulated. No gateway or entitlements.
-- Additive migration. Existing user/listing/chat data is preserved.
BEGIN;

-- New navigation target and safe event types for existing in-app notifications.
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS listing_id uuid REFERENCES public.listings(id) ON DELETE SET NULL;
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_kind_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_kind_check CHECK (
  kind IN ('message','offer','offer_accepted','offer_declined','offer_withdrawn',
           'admin_listing_pending','listing_approved','listing_rejected','admin_report','admin_verification','verification_approved','verification_rejected')
);
CREATE INDEX IF NOT EXISTS notifications_listing_target_idx ON public.notifications(listing_id) WHERE listing_id IS NOT NULL;

-- When an ad is submitted/edited/relisted, inform admins; when reviewed, inform seller.
-- SECURITY DEFINER because normal users must never be able to directly write arbitrary notifications.
CREATE OR REPLACE FUNCTION public.marketly_notify_listing_moderation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_pending boolean := false;
BEGIN
  IF TG_OP='INSERT' THEN
    v_pending := NEW.moderation_status='pending';
  ELSIF TG_OP='UPDATE' AND OLD.moderation_status IS DISTINCT FROM NEW.moderation_status THEN
    v_pending := NEW.moderation_status='pending';
    IF NEW.moderation_status IN ('approved','rejected') THEN
      INSERT INTO public.notifications(recipient_id,actor_id,listing_id,kind,title)
      VALUES (NEW.seller_id,auth.uid(),NEW.id,
        CASE WHEN NEW.moderation_status='approved' THEN 'listing_approved' ELSE 'listing_rejected' END,
        left(CASE WHEN NEW.moderation_status='approved' THEN 'Your advertisement was approved: '
                  ELSE 'Your advertisement needs attention: ' END||NEW.title,140));
    END IF;
  END IF;
  IF v_pending THEN
    INSERT INTO public.notifications(recipient_id,actor_id,listing_id,kind,title)
    SELECT a.user_id, NEW.seller_id, NEW.id,'admin_listing_pending',
           left('New advertisement awaiting review: '||NEW.title,140)
    FROM public.marketly_admins a JOIN public.profiles p ON p.id=a.user_id;
  END IF;
  RETURN NEW;
END$$;
REVOKE ALL ON FUNCTION public.marketly_notify_listing_moderation() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS marketly_listing_moderation_notices ON public.listings;
CREATE TRIGGER marketly_listing_moderation_notices
AFTER INSERT OR UPDATE OF moderation_status ON public.listings
FOR EACH ROW EXECUTE FUNCTION public.marketly_notify_listing_moderation();

-- Optional helpful moderation alerts for reports and verification requests.
CREATE OR REPLACE FUNCTION public.marketly_notify_admin_new_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF TG_TABLE_NAME='listing_reports' THEN
   INSERT INTO public.notifications(recipient_id,actor_id,listing_id,kind,title)
   SELECT a.user_id,NEW.reporter_id,NEW.listing_id,'admin_report','A listing has been reported'
   FROM public.marketly_admins a JOIN public.profiles p ON p.id=a.user_id;
 ELSIF TG_TABLE_NAME='seller_verification_requests' THEN
   INSERT INTO public.notifications(recipient_id,actor_id,kind,title)
   SELECT a.user_id,NEW.seller_id,'admin_verification','New seller verification request'
   FROM public.marketly_admins a JOIN public.profiles p ON p.id=a.user_id;
 END IF;
 RETURN NEW;
END$$;
REVOKE ALL ON FUNCTION public.marketly_notify_admin_new_request() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS marketly_new_report_notice ON public.listing_reports;
CREATE TRIGGER marketly_new_report_notice AFTER INSERT ON public.listing_reports
 FOR EACH ROW EXECUTE FUNCTION public.marketly_notify_admin_new_request();
DROP TRIGGER IF EXISTS marketly_new_verification_notice ON public.seller_verification_requests;
CREATE TRIGGER marketly_new_verification_notice AFTER INSERT ON public.seller_verification_requests
 FOR EACH ROW EXECUTE FUNCTION public.marketly_notify_admin_new_request();

CREATE OR REPLACE FUNCTION public.marketly_notify_verification_decision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF OLD.status='pending' AND NEW.status IN ('approved','rejected') AND NEW.status<>OLD.status THEN
  INSERT INTO public.notifications(recipient_id,actor_id,kind,title)
  VALUES(NEW.seller_id,auth.uid(),
    CASE WHEN NEW.status='approved' THEN 'verification_approved' ELSE 'verification_rejected' END,
    CASE WHEN NEW.status='approved' THEN 'Your seller verification was approved' ELSE 'Your seller verification was rejected' END);
 END IF;
 RETURN NEW;
END$$;
REVOKE ALL ON FUNCTION public.marketly_notify_verification_decision() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS marketly_verification_decision_notice ON public.seller_verification_requests;
CREATE TRIGGER marketly_verification_decision_notice AFTER UPDATE OF status ON public.seller_verification_requests
 FOR EACH ROW EXECUTE FUNCTION public.marketly_notify_verification_decision();

-- Test-only ledger: every 'payment' is simulated and can NEVER grant a paid benefit.
CREATE TABLE IF NOT EXISTS public.marketly_test_orders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 listing_id uuid REFERENCES public.listings(id) ON DELETE SET NULL,
 request_key uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('boost','photos','business')),
 plan_id text,
 photo_count integer,
 amount_lkr integer NOT NULL CHECK(amount_lkr>0),
 payment_mode text NOT NULL DEFAULT 'test' CHECK(payment_mode='test'),
 status text NOT NULL DEFAULT 'simulated' CHECK(status='simulated'),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,request_key)
);
CREATE INDEX IF NOT EXISTS marketly_test_orders_user_recent ON public.marketly_test_orders(user_id,created_at DESC);
ALTER TABLE public.marketly_test_orders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.marketly_test_orders FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.marketly_test_orders TO authenticated;
DROP POLICY IF EXISTS "Owners and admins read simulated purchases" ON public.marketly_test_orders;
CREATE POLICY "Owners and admins read simulated purchases" ON public.marketly_test_orders
 FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()) OR public.marketly_is_admin());

-- Server-side authoritative pricing. Never accept amount from the browser.
-- NO paid status/boost/subscription/listing quota is changed by this function.
CREATE OR REPLACE FUNCTION public.marketly_create_test_order(
 p_kind text,p_listing_id uuid,p_plan_id text,p_photo_count integer,p_request_key uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user uuid:=auth.uid(); v_amount integer; v_id uuid;
BEGIN
 IF v_user IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=v_user) THEN RAISE EXCEPTION 'LOGIN_REQUIRED'; END IF;
 IF p_request_key IS NULL THEN RAISE EXCEPTION 'REQUEST_KEY_REQUIRED'; END IF;
 IF p_kind='boost' THEN
   IF p_photo_count IS NOT NULL OR p_listing_id IS NULL THEN RAISE EXCEPTION 'INVALID_BOOST_REQUEST'; END IF;
   IF p_plan_id='starter' THEN v_amount:=100;
   ELSIF p_plan_id='popular' THEN v_amount:=180;
   ELSIF p_plan_id='premium' THEN v_amount:=300;
   ELSE RAISE EXCEPTION 'INVALID_BOOST_PLAN'; END IF;
   IF NOT EXISTS(SELECT 1 FROM public.listings WHERE id=p_listing_id AND seller_id=v_user AND status='active' AND moderation_status='approved')
   THEN RAISE EXCEPTION 'APPROVED_OWNED_AD_REQUIRED'; END IF;
 ELSIF p_kind='photos' THEN
   IF p_plan_id IS NOT NULL OR p_listing_id IS NOT NULL OR p_photo_count IS NULL OR p_photo_count NOT BETWEEN 6 AND 12
   THEN RAISE EXCEPTION 'INVALID_PHOTO_TEST'; END IF;
   v_amount:=(p_photo_count-5)*100;
 ELSIF p_kind='business' THEN
   IF p_listing_id IS NOT NULL OR p_plan_id IS NOT NULL OR p_photo_count IS NOT NULL
   THEN RAISE EXCEPTION 'INVALID_BUSINESS_TEST'; END IF;
   v_amount:=300;
 ELSE RAISE EXCEPTION 'UNKNOWN_PRODUCT'; END IF;

 INSERT INTO public.marketly_test_orders(user_id,listing_id,request_key,kind,plan_id,photo_count,amount_lkr)
 VALUES(v_user,p_listing_id,p_request_key,p_kind,p_plan_id,p_photo_count,v_amount)
 ON CONFLICT(user_id,request_key) DO NOTHING RETURNING id INTO v_id;
 IF v_id IS NULL THEN
   SELECT id INTO v_id FROM public.marketly_test_orders WHERE user_id=v_user AND request_key=p_request_key;
 END IF;
 RETURN v_id;
END$$;
REVOKE ALL ON FUNCTION public.marketly_create_test_order(text,uuid,text,integer,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.marketly_create_test_order(text,uuid,text,integer,uuid) TO authenticated;
COMMIT;
