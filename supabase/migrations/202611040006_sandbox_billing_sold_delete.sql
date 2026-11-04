-- MARKETLY PHASE 05B | Apply ONCE after SQL 005 in the existing project.
-- Seller soft-delete, sold notices, and sandbox-only billing records.
-- NO LIVE MONEY or production entitlements can be issued by this migration.
BEGIN;

-- A 'delete' action hides an ad but retains chat history, reports and immutable quota ledger.
ALTER TABLE public.listings DROP CONSTRAINT IF EXISTS listings_status_check;
ALTER TABLE public.listings ADD CONSTRAINT listings_status_check
  CHECK (status IN ('active','sold','removed','deleted'));
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- System messages are distinguishable from user-typed messages. Direct inserts remain prohibited.
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false;
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_kind_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_kind_check CHECK (
  kind IN ('message','offer','offer_accepted','offer_declined','offer_withdrawn',
           'admin_listing_pending','listing_approved','listing_rejected','admin_report',
           'admin_verification','verification_approved','verification_rejected','listing_sold')
);
CREATE INDEX IF NOT EXISTS conversations_listing_for_sold_idx ON public.conversations(listing_id);

-- Exactly one sold event per actual active->sold status change. Runs atomically with Mark Sold;
-- if notifications fail, the sale-status change rolls back rather than losing notices.
CREATE OR REPLACE FUNCTION public.marketly_on_listing_sold()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NEW.status='sold' AND OLD.status IS DISTINCT FROM 'sold' THEN
    INSERT INTO public.messages(conversation_id,sender_id,body,is_system)
    SELECT c.id,NEW.seller_id,
           'Marketly system notice: The seller marked this item as SOLD. This listing is no longer available.',true
    FROM public.conversations c WHERE c.listing_id=NEW.id;

    UPDATE public.offers SET status='declined',updated_at=now()
    WHERE status='pending' AND conversation_id IN (
      SELECT c.id FROM public.conversations c WHERE c.listing_id=NEW.id
    );

    UPDATE public.conversations SET last_message_at=now() WHERE listing_id=NEW.id;

    INSERT INTO public.notifications(recipient_id,actor_id,conversation_id,listing_id,kind,title)
    SELECT c.buyer_id,NEW.seller_id,c.id,NEW.id,'listing_sold',
           left('Item sold: '||NEW.title,140)
    FROM public.conversations c WHERE c.listing_id=NEW.id;
  END IF;
  RETURN NEW;
END$$;
REVOKE ALL ON FUNCTION public.marketly_on_listing_sold() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS marketly_listing_sold_notice ON public.listings;
CREATE TRIGGER marketly_listing_sold_notice AFTER UPDATE OF status ON public.listings
 FOR EACH ROW WHEN (NEW.status='sold' AND OLD.status IS DISTINCT FROM 'sold')
 EXECUTE FUNCTION public.marketly_on_listing_sold();

-- Keep the old RPC signature so existing app and scripts continue working.
CREATE OR REPLACE FUNCTION public.marketly_change_listing_status(p_listing_id uuid,p_action text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_owner uuid:=auth.uid();v_status text;v_review text;
BEGIN
 IF v_owner IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
 SELECT status,moderation_status INTO v_status,v_review FROM public.listings
 WHERE id=p_listing_id AND seller_id=v_owner FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_YOUR_AD'; END IF;
 IF v_status='deleted' THEN RAISE EXCEPTION 'AD_ALREADY_DELETED'; END IF;
 IF p_action='sold' THEN
  IF v_status<>'active' OR v_review<>'approved' THEN RAISE EXCEPTION 'NOT_APPROVED_ACTIVE'; END IF;
  UPDATE public.listings SET status='sold' WHERE id=p_listing_id;
 ELSIF p_action='pause' THEN
  IF v_status<>'active' THEN RAISE EXCEPTION 'ONLY_ACTIVE_AD_CAN_BE_PAUSED'; END IF;
  UPDATE public.listings SET status='removed' WHERE id=p_listing_id;
 ELSIF p_action='relist' THEN
  IF v_status NOT IN ('sold','removed') THEN RAISE EXCEPTION 'NOT_SOLD_OR_PAUSED'; END IF;
  UPDATE public.listings SET status='active',moderation_status='pending',reviewed_at=NULL,
    moderation_note=NULL WHERE id=p_listing_id;
 ELSIF p_action='delete' THEN
  UPDATE public.listings SET status='deleted',deleted_at=now() WHERE id=p_listing_id;
 ELSE RAISE EXCEPTION 'INVALID_STATUS'; END IF;
END$$;
REVOKE ALL ON FUNCTION public.marketly_change_listing_status(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.marketly_change_listing_status(uuid,text) TO authenticated;

-- A deleted ad must not be edited into an accidental reappearance.
CREATE OR REPLACE FUNCTION public.marketly_refuse_deleted_listing_edit()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF OLD.status='deleted' AND NEW.status IS DISTINCT FROM OLD.status THEN
  RAISE EXCEPTION 'DELETED_AD_CANNOT_BE_RESTORED';
 END IF;
 IF OLD.status='deleted' AND (
   NEW.title IS DISTINCT FROM OLD.title OR NEW.description IS DISTINCT FROM OLD.description OR
   NEW.price_lkr IS DISTINCT FROM OLD.price_lkr OR NEW.moderation_status IS DISTINCT FROM OLD.moderation_status
 ) THEN RAISE EXCEPTION 'DELETED_AD_CANNOT_BE_EDITED'; END IF;
 RETURN NEW;
END$$;
DROP TRIGGER IF EXISTS marketly_protect_deleted_ad ON public.listings;
CREATE TRIGGER marketly_protect_deleted_ad BEFORE UPDATE ON public.listings
 FOR EACH ROW EXECUTE FUNCTION public.marketly_refuse_deleted_listing_edit();

-- Prevent privileged image-edit functions from mutating the archived photo records.
CREATE OR REPLACE FUNCTION public.marketly_refuse_deleted_photo_edit()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE v_listing uuid;
BEGIN
 v_listing:=CASE WHEN TG_OP='DELETE' THEN OLD.listing_id ELSE NEW.listing_id END;
 IF EXISTS(SELECT 1 FROM public.listings WHERE id=v_listing AND status='deleted') THEN
   RAISE EXCEPTION 'DELETED_AD_PHOTOS_CANNOT_BE_EDITED';
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END$$;
DROP TRIGGER IF EXISTS marketly_protect_deleted_photos ON public.listing_images;
CREATE TRIGGER marketly_protect_deleted_photos BEFORE INSERT OR UPDATE OR DELETE ON public.listing_images
 FOR EACH ROW EXECUTE FUNCTION public.marketly_refuse_deleted_photo_edit();

-- Chat participants may read a sold/deleted listing's non-sensitive title and status,
-- without exposing it in public browse or allowing access by unrelated users.
CREATE OR REPLACE FUNCTION public.marketly_conversation_listing_meta(p_conversation_id uuid)
RETURNS TABLE(listing_title text,listing_status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT l.title,l.status FROM public.conversations c
 JOIN public.listings l ON l.id=c.listing_id
 WHERE c.id=p_conversation_id AND auth.uid() IS NOT NULL
 AND auth.uid() IN (c.buyer_id,c.seller_id)
$$;
REVOKE ALL ON FUNCTION public.marketly_conversation_listing_meta(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.marketly_conversation_listing_meta(uuid) TO authenticated;

-- Separate sandbox ledger, intentionally NOT joined to real posting, promotion or upload RPCs.
CREATE TABLE IF NOT EXISTS public.marketly_sandbox_payments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 listing_id uuid REFERENCES public.listings(id) ON DELETE SET NULL,
 request_key uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN('extra_ad','boost','photos','business')),
 plan_id text,
 photo_count integer,
 amount_lkr integer NOT NULL CHECK(amount_lkr>0),
 mode text NOT NULL DEFAULT 'sandbox' CHECK(mode='sandbox'),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','simulated_success','simulated_failure')),
 created_at timestamptz NOT NULL DEFAULT now(),
 verified_at timestamptz,
 UNIQUE(user_id,request_key)
);
CREATE INDEX IF NOT EXISTS marketly_sandbox_payments_user_idx ON public.marketly_sandbox_payments(user_id,created_at DESC);
ALTER TABLE public.marketly_sandbox_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.marketly_sandbox_payments FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.marketly_sandbox_payments TO authenticated;
CREATE POLICY "Sandbox payments visible to owner and admin" ON public.marketly_sandbox_payments
 FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()) OR public.marketly_is_admin());

CREATE TABLE IF NOT EXISTS public.marketly_sandbox_entitlements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 payment_id uuid NOT NULL UNIQUE REFERENCES public.marketly_sandbox_payments(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN('posting_credit','boost','photo_quote','business')),
 listing_id uuid REFERENCES public.listings(id) ON DELETE SET NULL,
 credits_total integer NOT NULL DEFAULT 0 CHECK(credits_total BETWEEN 0 AND 3),
 credits_used integer NOT NULL DEFAULT 0 CHECK(credits_used>=0 AND credits_used<=credits_total),
 photo_count integer,
 starts_at timestamptz NOT NULL DEFAULT now(),
 ends_at timestamptz NOT NULL,
 mode text NOT NULL DEFAULT 'sandbox' CHECK(mode='sandbox'),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(ends_at>starts_at)
);
CREATE INDEX IF NOT EXISTS marketly_sandbox_entitlements_user_idx
 ON public.marketly_sandbox_entitlements(user_id,ends_at DESC);
ALTER TABLE public.marketly_sandbox_entitlements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.marketly_sandbox_entitlements FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.marketly_sandbox_entitlements TO authenticated;
CREATE POLICY "Sandbox entitlements visible to owner and admin" ON public.marketly_sandbox_entitlements
 FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()) OR public.marketly_is_admin());

-- Authenticated seller can ONLY create a pending, authoritative-price sandbox payment.
CREATE OR REPLACE FUNCTION public.marketly_sandbox_start_checkout(
 p_user_id uuid,p_kind text,p_listing_id uuid,p_plan_id text,p_photo_count integer,p_request_key uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user uuid:=p_user_id;v_amount integer;v_id uuid;v_existing public.marketly_sandbox_payments%ROWTYPE;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'SERVICE_ROLE_ONLY'; END IF;
 IF v_user IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=v_user) THEN RAISE EXCEPTION 'ACCOUNT_NOT_FOUND'; END IF;
 IF p_request_key IS NULL THEN RAISE EXCEPTION 'REQUEST_KEY_REQUIRED'; END IF;
 SELECT * INTO v_existing FROM public.marketly_sandbox_payments WHERE user_id=v_user AND request_key=p_request_key;
 IF FOUND THEN
   IF v_existing.kind IS DISTINCT FROM p_kind OR v_existing.listing_id IS DISTINCT FROM p_listing_id
   OR v_existing.plan_id IS DISTINCT FROM p_plan_id OR v_existing.photo_count IS DISTINCT FROM p_photo_count
   THEN RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_ORDER'; END IF;
   RETURN v_existing.id;
 END IF;
 IF (SELECT count(*) FROM public.marketly_sandbox_payments
   WHERE user_id=v_user AND created_at>now()-interval '1 hour')>=30 THEN RAISE EXCEPTION 'SANDBOX_RATE_LIMIT'; END IF;
 IF p_kind='boost' THEN
   IF p_listing_id IS NULL OR p_photo_count IS NOT NULL THEN RAISE EXCEPTION 'INVALID_BOOST_REQUEST'; END IF;
   IF p_plan_id='starter' THEN v_amount:=100;
   ELSIF p_plan_id='popular' THEN v_amount:=180;
   ELSIF p_plan_id='premium' THEN v_amount:=300;
   ELSE RAISE EXCEPTION 'INVALID_BOOST_PLAN'; END IF;
   IF NOT EXISTS(SELECT 1 FROM public.listings WHERE id=p_listing_id AND seller_id=v_user
     AND status='active' AND moderation_status='approved') THEN RAISE EXCEPTION 'APPROVED_OWNED_AD_REQUIRED'; END IF;
 ELSIF p_kind='photos' THEN
   IF p_listing_id IS NOT NULL OR p_plan_id IS NOT NULL OR p_photo_count NOT BETWEEN 6 AND 12 THEN RAISE EXCEPTION 'INVALID_PHOTO_QUOTE'; END IF;
   v_amount:=(p_photo_count-5)*100;
 ELSIF p_kind='business' THEN
   IF p_listing_id IS NOT NULL OR p_plan_id IS NOT NULL OR p_photo_count IS NOT NULL THEN RAISE EXCEPTION 'INVALID_BUSINESS_REQUEST'; END IF;
   v_amount:=300;
   IF EXISTS(SELECT 1 FROM public.marketly_sandbox_entitlements WHERE user_id=v_user
     AND kind='business' AND ends_at>now()) THEN RAISE EXCEPTION 'SANDBOX_BUSINESS_ALREADY_ACTIVE'; END IF;
 ELSIF p_kind='extra_ad' THEN
   IF p_listing_id IS NOT NULL OR p_plan_id IS NOT NULL OR p_photo_count IS NOT NULL THEN RAISE EXCEPTION 'INVALID_EXTRA_AD_REQUEST'; END IF;
   v_amount:=100;
 ELSE RAISE EXCEPTION 'UNKNOWN_SANDBOX_PRODUCT'; END IF;
 INSERT INTO public.marketly_sandbox_payments(user_id,listing_id,kind,plan_id,photo_count,amount_lkr,request_key)
 VALUES(v_user,p_listing_id,p_kind,p_plan_id,p_photo_count,v_amount,p_request_key)
 ON CONFLICT (user_id,request_key) DO NOTHING RETURNING id INTO v_id;
 IF v_id IS NULL THEN SELECT id INTO v_id FROM public.marketly_sandbox_payments
   WHERE user_id=v_user AND request_key=p_request_key; END IF;
 RETURN v_id;
END$$;
REVOKE ALL ON FUNCTION public.marketly_sandbox_start_checkout(uuid,text,uuid,text,integer,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.marketly_sandbox_start_checkout(uuid,text,uuid,text,integer,uuid) TO service_role;

-- Only service_role can simulate an authenticated callback; users cannot grant themselves benefits.
CREATE OR REPLACE FUNCTION public.marketly_sandbox_record_result(p_payment_id uuid,p_success boolean)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_order public.marketly_sandbox_payments%ROWTYPE;v_days integer;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'SERVICE_ROLE_ONLY'; END IF;
 SELECT * INTO v_order FROM public.marketly_sandbox_payments WHERE id=p_payment_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'SANDBOX_PAYMENT_NOT_FOUND'; END IF;
 IF v_order.status<>'pending' THEN RETURN v_order.status; END IF;
 IF p_success IS NULL THEN RAISE EXCEPTION 'INVALID_SANDBOX_RESULT'; END IF;
 IF p_success THEN
   IF v_order.kind='boost' AND NOT EXISTS(SELECT 1 FROM public.listings WHERE id=v_order.listing_id AND seller_id=v_order.user_id
     AND status='active' AND moderation_status='approved') THEN RAISE EXCEPTION 'AD_NO_LONGER_ELIGIBLE_FOR_BOOST'; END IF;
   UPDATE public.marketly_sandbox_payments SET status='simulated_success',verified_at=now() WHERE id=p_payment_id;
   v_days:=CASE v_order.plan_id WHEN 'starter' THEN 7 WHEN 'popular' THEN 14 WHEN 'premium' THEN 30 ELSE 30 END;
   INSERT INTO public.marketly_sandbox_entitlements(payment_id,user_id,kind,listing_id,credits_total,photo_count,ends_at)
   VALUES(v_order.id,v_order.user_id,
     CASE v_order.kind WHEN 'extra_ad' THEN 'posting_credit' WHEN 'photos' THEN 'photo_quote' ELSE v_order.kind END,
     v_order.listing_id,CASE v_order.kind WHEN 'extra_ad' THEN 1 WHEN 'business' THEN 3 ELSE 0 END,
     v_order.photo_count,now()+make_interval(days=>v_days))
   ON CONFLICT(payment_id) DO NOTHING;
 ELSE
   UPDATE public.marketly_sandbox_payments SET status='simulated_failure',verified_at=now() WHERE id=p_payment_id;
 END IF;
 RETURN CASE WHEN p_success THEN 'simulated_success' ELSE 'simulated_failure' END;
END$$;
REVOKE ALL ON FUNCTION public.marketly_sandbox_record_result(uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.marketly_sandbox_record_result(uuid,boolean) TO service_role;

-- Exercise quota consumption in the test ledger only. Does NOT publish a real ad.
CREATE OR REPLACE FUNCTION public.marketly_sandbox_consume_credit(p_user_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_id uuid;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'SERVICE_ROLE_ONLY'; END IF;
 SELECT id INTO v_id FROM public.marketly_sandbox_entitlements
 WHERE user_id=p_user_id AND kind IN('posting_credit','business')
   AND ends_at>now() AND credits_used<credits_total
 ORDER BY ends_at,created_at LIMIT 1 FOR UPDATE;
 IF v_id IS NULL THEN RETURN false; END IF;
 UPDATE public.marketly_sandbox_entitlements SET credits_used=credits_used+1 WHERE id=v_id;
 RETURN true;
END$$;
REVOKE ALL ON FUNCTION public.marketly_sandbox_consume_credit(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.marketly_sandbox_consume_credit(uuid) TO service_role;
COMMIT;
