-- MARKETLY PHASE 04. Run ONCE after 001, 002, 003. Existing ads preserved.
-- Optional: back up your Supabase database before migrating.
BEGIN;
CREATE TABLE IF NOT EXISTS public.marketly_admins (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.marketly_admins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.marketly_admins FROM anon,authenticated;
CREATE OR REPLACE FUNCTION public.marketly_is_admin() RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS(SELECT 1 FROM public.marketly_admins WHERE user_id=auth.uid());
 $$;
REVOKE ALL ON FUNCTION public.marketly_is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.marketly_is_admin() TO anon,authenticated;

ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS moderation_status text;
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS moderation_note text;
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS is_negotiable boolean NOT NULL DEFAULT false;
-- Only backfill records that existed BEFORE applying this SQL. New ones default pending.
UPDATE public.listings SET moderation_status='approved' WHERE moderation_status IS NULL;
ALTER TABLE public.listings ALTER COLUMN moderation_status SET DEFAULT 'pending';
ALTER TABLE public.listings ALTER COLUMN moderation_status SET NOT NULL;
DO $$BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='marketly_listing_moderation_valid') THEN
  ALTER TABLE public.listings ADD CONSTRAINT marketly_listing_moderation_valid CHECK(moderation_status IN('pending','approved','rejected'));
 END IF;
END$$;
ALTER TABLE public.listing_images ADD COLUMN IF NOT EXISTS preview_storage_path text;
CREATE UNIQUE INDEX IF NOT EXISTS listing_images_preview_unique ON public.listing_images(preview_storage_path) WHERE preview_storage_path IS NOT NULL;
DROP POLICY IF EXISTS "Public sees active listings and owners see theirs" ON public.listings;
DROP POLICY IF EXISTS "Public sees approved ads, owners and admins see theirs" ON public.listings;
CREATE POLICY "Public sees approved ads, owners and admins see theirs" ON public.listings
 FOR SELECT TO anon,authenticated USING(
 (status='active' AND moderation_status='approved') OR seller_id=(SELECT auth.uid()) OR public.marketly_is_admin()
 );
DROP POLICY IF EXISTS "Public sees images of visible listings" ON public.listing_images;
DROP POLICY IF EXISTS "Images follow listing visibility" ON public.listing_images;
CREATE POLICY "Images follow listing visibility" ON public.listing_images
 FOR SELECT TO anon,authenticated USING(EXISTS(
 SELECT 1 FROM public.listings l WHERE l.id=listing_id AND (
 (l.status='active' AND l.moderation_status='approved') OR l.seller_id=(SELECT auth.uid()) OR public.marketly_is_admin()
 )));

CREATE TABLE IF NOT EXISTS public.marketly_admin_log (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),admin_id uuid NOT NULL REFERENCES auth.users(id),
 action text NOT NULL,target_id uuid,note text,created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.marketly_admin_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.marketly_admin_log FROM anon,authenticated;
GRANT SELECT ON public.marketly_admin_log TO authenticated;
DROP POLICY IF EXISTS "Only admins see audit log" ON public.marketly_admin_log;
CREATE POLICY "Only admins see audit log" ON public.marketly_admin_log FOR SELECT TO authenticated USING(public.marketly_is_admin());

CREATE TABLE IF NOT EXISTS public.listing_reports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
 reporter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 reason text NOT NULL CHECK(reason IN('scam','counterfeit','prohibited','wrong_information','other')),
 details text NOT NULL DEFAULT '' CHECK(char_length(details)<=1000),
 status text NOT NULL DEFAULT 'open' CHECK(status IN('open','resolved','dismissed')),
 reviewed_at timestamptz,created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.listing_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.listing_reports FROM anon,authenticated;
GRANT SELECT ON public.listing_reports TO authenticated;
DROP POLICY IF EXISTS "Reporters and admins see reports" ON public.listing_reports;
CREATE POLICY "Reporters and admins see reports" ON public.listing_reports FOR SELECT TO authenticated
 USING(reporter_id=(SELECT auth.uid()) OR public.marketly_is_admin());
CREATE INDEX IF NOT EXISTS listing_reports_status_created_idx ON public.listing_reports(status,created_at DESC);

CREATE TABLE IF NOT EXISTS public.seller_verification_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),seller_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN('identity','business')),
 details text NOT NULL DEFAULT '' CHECK(char_length(details)<=400),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','approved','rejected')),
 admin_note text,reviewed_at timestamptz,created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.seller_verification_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.seller_verification_requests FROM anon,authenticated;
GRANT SELECT ON public.seller_verification_requests TO authenticated;
DROP POLICY IF EXISTS "Request owner and admins can see" ON public.seller_verification_requests;
CREATE POLICY "Request owner and admins can see" ON public.seller_verification_requests FOR SELECT TO authenticated
 USING(seller_id=(SELECT auth.uid()) OR public.marketly_is_admin());
CREATE UNIQUE INDEX IF NOT EXISTS one_pending_seller_verification ON public.seller_verification_requests(seller_id,kind) WHERE status='pending';

-- All editing, publishing and moderation are owner/admin checked SECURITY DEFINER functions.
CREATE OR REPLACE FUNCTION public.marketly_publish_listing(
 p_title text,p_description text,p_price_lkr bigint,p_category text,p_location text,p_condition text,
 p_is_negotiable boolean,p_image_paths text[],p_preview_paths text[]
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,storage,pg_temp AS $$
DECLARE v_user uuid:=auth.uid(); v_month date:=date_trunc('month',timezone('Asia/Colombo',now()))::date;
 v_id uuid;v_i integer;v_n integer:=coalesce(cardinality(p_image_paths),0);
BEGIN
 IF v_user IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=v_user) THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
 IF char_length(btrim(p_title)) NOT BETWEEN 5 AND 90 OR char_length(btrim(p_description)) NOT BETWEEN 20 AND 2500
 OR p_price_lkr NOT BETWEEN 1 AND 999999999
 OR p_category NOT IN('Mobiles','Vehicles','Property','Electronics','Home & Living','Fashion','Services','Other')
 OR p_location NOT IN('Colombo','Gampaha','Kalutara','Kandy','Matale','Nuwara Eliya','Galle','Matara','Hambantota','Jaffna','Kilinochchi','Mannar','Mullaitivu','Vavuniya','Trincomalee','Batticaloa','Ampara','Kurunegala','Puttalam','Anuradhapura','Polonnaruwa','Badulla','Monaragala','Ratnapura','Kegalle')
 OR p_condition NOT IN('New','Used','Refurbished') OR p_is_negotiable IS NULL THEN RAISE EXCEPTION 'INVALID_LISTING_DATA'; END IF;
 IF v_n NOT BETWEEN 1 AND 5 OR coalesce(cardinality(p_preview_paths),0)<>v_n THEN RAISE EXCEPTION 'EXTRA_IMAGE_PAYMENT_REQUIRED'; END IF;
 IF (SELECT count(DISTINCT u.path) FROM unnest(p_image_paths) AS u(path))<>v_n
 OR (SELECT count(DISTINCT u.path) FROM unnest(p_preview_paths) AS u(path))<>v_n THEN RAISE EXCEPTION 'DUPLICATE_IMAGE'; END IF;
 FOR v_i IN 1..v_n LOOP
  IF split_part(p_image_paths[v_i],'/',1)<>v_user::text OR split_part(p_preview_paths[v_i],'/',1)<>v_user::text
   OR p_image_paths[v_i]=p_preview_paths[v_i]
   OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='listing-images' AND name=p_image_paths[v_i])
   OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='listing-images' AND name=p_preview_paths[v_i])
   OR EXISTS(SELECT 1 FROM public.listing_images WHERE storage_path=p_image_paths[v_i] OR preview_storage_path=p_preview_paths[v_i])
  THEN RAISE EXCEPTION 'INVALID_IMAGE_OWNERSHIP'; END IF;
 END LOOP;
 PERFORM pg_advisory_xact_lock(hashtext(v_user::text),hashtext(v_month::text));
 IF (SELECT count(*) FROM public.listing_post_ledger WHERE seller_id=v_user AND billing_month=v_month)>=3 THEN RAISE EXCEPTION 'FREE_AD_QUOTA_EXCEEDED'; END IF;
 INSERT INTO public.listings(seller_id,title,description,price_lkr,category,location,condition,is_negotiable,status,moderation_status)
 VALUES(v_user,btrim(p_title),btrim(p_description),p_price_lkr,p_category,p_location,p_condition,p_is_negotiable,'active','pending') RETURNING id INTO v_id;
 FOR v_i IN 1..v_n LOOP
  INSERT INTO public.listing_images(listing_id,storage_path,preview_storage_path,position)
  VALUES(v_id,p_image_paths[v_i],p_preview_paths[v_i],v_i-1);
 END LOOP;
 INSERT INTO public.listing_post_ledger(seller_id,listing_id,billing_month)VALUES(v_user,v_id,v_month);
 RETURN v_id;
END$$;
REVOKE ALL ON FUNCTION public.marketly_publish_listing(text,text,bigint,text,text,text,boolean,text[],text[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.marketly_publish_listing(text,text,bigint,text,text,text,boolean,text[],text[]) TO authenticated;
-- Disable legacy publishing: it lacks dual images and review integration.
REVOKE ALL ON FUNCTION public.publish_listing(text,text,bigint,text,text,text,text[]) FROM authenticated;

CREATE OR REPLACE FUNCTION public.marketly_update_listing(
 p_listing_id uuid,p_title text,p_description text,p_price_lkr bigint,p_category text,p_location text,p_condition text,
 p_is_negotiable boolean,p_image_paths text[] DEFAULT NULL,p_preview_paths text[] DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,storage,pg_temp AS $$
DECLARE v_user uuid:=auth.uid();v_i integer;v_n integer;
BEGIN
 IF v_user IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
 PERFORM 1 FROM public.listings WHERE id=p_listing_id AND seller_id=v_user FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_YOUR_AD'; END IF;
 IF char_length(btrim(p_title)) NOT BETWEEN 5 AND 90 OR char_length(btrim(p_description)) NOT BETWEEN 20 AND 2500
 OR p_price_lkr NOT BETWEEN 1 AND 999999999
 OR p_category NOT IN('Mobiles','Vehicles','Property','Electronics','Home & Living','Fashion','Services','Other')
 OR p_location NOT IN('Colombo','Gampaha','Kalutara','Kandy','Matale','Nuwara Eliya','Galle','Matara','Hambantota','Jaffna','Kilinochchi','Mannar','Mullaitivu','Vavuniya','Trincomalee','Batticaloa','Ampara','Kurunegala','Puttalam','Anuradhapura','Polonnaruwa','Badulla','Monaragala','Ratnapura','Kegalle')
 OR p_condition NOT IN('New','Used','Refurbished') OR p_is_negotiable IS NULL THEN RAISE EXCEPTION 'INVALID_AD'; END IF;
 IF (p_image_paths IS NULL) <> (p_preview_paths IS NULL) THEN RAISE EXCEPTION 'IMAGE_PAIR_REQUIRED'; END IF;
 IF p_image_paths IS NOT NULL THEN
  v_n:=coalesce(cardinality(p_image_paths),0);
  IF v_n NOT BETWEEN 1 AND 5 OR coalesce(cardinality(p_preview_paths),0)<>v_n THEN RAISE EXCEPTION 'EXTRA_IMAGE_PAYMENT_REQUIRED'; END IF;
  IF (SELECT count(DISTINCT u.path) FROM unnest(p_image_paths) AS u(path))<>v_n OR (SELECT count(DISTINCT u.path) FROM unnest(p_preview_paths) AS u(path))<>v_n THEN RAISE EXCEPTION 'DUPLICATE_IMAGE'; END IF;
  FOR v_i IN 1..v_n LOOP
   IF split_part(p_image_paths[v_i],'/',1)<>v_user::text OR split_part(p_preview_paths[v_i],'/',1)<>v_user::text
   OR p_image_paths[v_i]=p_preview_paths[v_i]
   OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='listing-images' AND name=p_image_paths[v_i])
   OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='listing-images' AND name=p_preview_paths[v_i])
   OR EXISTS(SELECT 1 FROM public.listing_images WHERE storage_path=p_image_paths[v_i] OR preview_storage_path=p_preview_paths[v_i])
   THEN RAISE EXCEPTION 'INVALID_IMAGE_OWNERSHIP'; END IF;
  END LOOP;
  DELETE FROM public.listing_images WHERE listing_id=p_listing_id;
  FOR v_i IN 1..v_n LOOP
   INSERT INTO public.listing_images(listing_id,storage_path,preview_storage_path,position)VALUES(p_listing_id,p_image_paths[v_i],p_preview_paths[v_i],v_i-1);
  END LOOP;
 END IF;
 UPDATE public.listings SET title=btrim(p_title),description=btrim(p_description),price_lkr=p_price_lkr,
  category=p_category,location=p_location,condition=p_condition,is_negotiable=p_is_negotiable,
  moderation_status='pending',moderation_note=NULL,reviewed_at=NULL WHERE id=p_listing_id;
END$$;
REVOKE ALL ON FUNCTION public.marketly_update_listing(uuid,text,text,bigint,text,text,text,boolean,text[],text[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.marketly_update_listing(uuid,text,text,bigint,text,text,text,boolean,text[],text[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.marketly_change_listing_status(p_listing_id uuid,p_action text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_owner uuid:=auth.uid();v_status text;v_review text;
BEGIN
 IF v_owner IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
 SELECT status,moderation_status INTO v_status,v_review FROM public.listings WHERE id=p_listing_id AND seller_id=v_owner FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_YOUR_AD'; END IF;
 IF p_action='sold' THEN
  IF v_status<>'active' OR v_review<>'approved' THEN RAISE EXCEPTION 'NOT_APPROVED_ACTIVE'; END IF;
  UPDATE public.listings SET status='sold' WHERE id=p_listing_id;
 ELSIF p_action='pause' THEN
  UPDATE public.listings SET status='removed' WHERE id=p_listing_id;
 ELSIF p_action='relist' THEN
  IF v_status NOT IN('sold','removed') THEN RAISE EXCEPTION 'NOT_SOLD_OR_PAUSED'; END IF;
  UPDATE public.listings SET status='active',moderation_status='pending',reviewed_at=NULL,moderation_note=NULL WHERE id=p_listing_id;
 ELSE RAISE EXCEPTION 'INVALID_STATUS'; END IF;
END$$;
REVOKE ALL ON FUNCTION public.marketly_change_listing_status(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.marketly_change_listing_status(uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION public.set_listing_status(uuid,text) FROM authenticated;

CREATE OR REPLACE FUNCTION public.marketly_review_listing(p_listing_id uuid,p_decision text,p_note text DEFAULT '')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT public.marketly_is_admin() THEN RAISE EXCEPTION 'ADMIN_ONLY'; END IF;
 IF p_decision NOT IN('approved','rejected') OR char_length(coalesce(p_note,''))>500 THEN RAISE EXCEPTION 'INVALID_REVIEW'; END IF;
 UPDATE public.listings SET moderation_status=p_decision,moderation_note=nullif(btrim(p_note),''),reviewed_at=now()
 WHERE id=p_listing_id AND moderation_status='pending';
 IF NOT FOUND THEN RAISE EXCEPTION 'PENDING_AD_REQUIRED'; END IF;
 INSERT INTO public.marketly_admin_log(admin_id,action,target_id,note) VALUES(auth.uid(),'listing_'||p_decision,p_listing_id,p_note);
END$$;
REVOKE ALL ON FUNCTION public.marketly_review_listing(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.marketly_review_listing(uuid,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.marketly_report_listing(p_listing_id uuid,p_reason text,p_details text DEFAULT '')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user uuid:=auth.uid();v_id uuid;
BEGIN
 IF v_user IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
 IF p_reason NOT IN('scam','counterfeit','prohibited','wrong_information','other') OR char_length(coalesce(p_details,''))>1000 THEN RAISE EXCEPTION 'INVALID_REPORT'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.listings WHERE id=p_listing_id AND status='active' AND moderation_status='approved' AND seller_id<>v_user) THEN RAISE EXCEPTION 'AD_NOT_REPORTABLE'; END IF;
 IF EXISTS(SELECT 1 FROM public.listing_reports WHERE listing_id=p_listing_id AND reporter_id=v_user AND created_at>now()-interval '24 hours') THEN RAISE EXCEPTION 'REPORT_ALREADY_SENT'; END IF;
 INSERT INTO public.listing_reports(listing_id,reporter_id,reason,details) VALUES(p_listing_id,v_user,p_reason,coalesce(btrim(p_details),'')) RETURNING id INTO v_id;
 RETURN v_id;
END$$;
REVOKE ALL ON FUNCTION public.marketly_report_listing(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.marketly_report_listing(uuid,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.marketly_review_report(p_report_id uuid,p_action text,p_note text DEFAULT '')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_listing uuid;
BEGIN
 IF NOT public.marketly_is_admin() THEN RAISE EXCEPTION 'ADMIN_ONLY'; END IF;
 IF p_action NOT IN('hide','resolve','dismiss') OR char_length(coalesce(p_note,''))>500 THEN RAISE EXCEPTION 'INVALID_ACTION'; END IF;
 SELECT listing_id INTO v_listing FROM public.listing_reports WHERE id=p_report_id AND status='open' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'OPEN_REPORT_REQUIRED'; END IF;
 UPDATE public.listing_reports SET status=CASE WHEN p_action='dismiss' THEN 'dismissed' ELSE 'resolved' END,reviewed_at=now() WHERE id=p_report_id;
 IF p_action='hide' THEN UPDATE public.listings SET moderation_status='rejected',moderation_note=coalesce(nullif(btrim(p_note),''),'Hidden after report'),reviewed_at=now() WHERE id=v_listing; END IF;
 INSERT INTO public.marketly_admin_log(admin_id,action,target_id,note) VALUES(auth.uid(),'report_'||p_action,p_report_id,p_note);
END$$;
REVOKE ALL ON FUNCTION public.marketly_review_report(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.marketly_review_report(uuid,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.marketly_request_verification(p_kind text,p_details text DEFAULT '')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_id uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
 IF p_kind NOT IN('identity','business') OR char_length(coalesce(p_details,''))>400 THEN RAISE EXCEPTION 'INVALID_REQUEST'; END IF;
 IF EXISTS(SELECT 1 FROM public.seller_verification_requests WHERE seller_id=auth.uid() AND kind=p_kind AND status='pending') THEN RAISE EXCEPTION 'REQUEST_ALREADY_PENDING'; END IF;
 INSERT INTO public.seller_verification_requests(seller_id,kind,details)VALUES(auth.uid(),p_kind,coalesce(btrim(p_details),''))RETURNING id INTO v_id;
 RETURN v_id;
END$$;
REVOKE ALL ON FUNCTION public.marketly_request_verification(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.marketly_request_verification(text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.marketly_review_verification(p_request_id uuid,p_decision text,p_note text DEFAULT '')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_seller uuid;v_kind text;
BEGIN
 IF NOT public.marketly_is_admin() THEN RAISE EXCEPTION 'ADMIN_ONLY'; END IF;
 IF p_decision NOT IN('approved','rejected') OR char_length(coalesce(p_note,''))>500 THEN RAISE EXCEPTION 'INVALID_ACTION'; END IF;
 SELECT seller_id,kind INTO v_seller,v_kind FROM public.seller_verification_requests WHERE id=p_request_id AND status='pending' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'PENDING_REQUEST_REQUIRED'; END IF;
 UPDATE public.seller_verification_requests SET status=p_decision,admin_note=p_note,reviewed_at=now() WHERE id=p_request_id;
 IF p_decision='approved' AND v_kind='identity' THEN
  -- IMPORTANT: Admin must verify identity through a legitimate separate process first.
  UPDATE public.profiles SET identity_verified=true WHERE id=v_seller;
 END IF;
 INSERT INTO public.marketly_admin_log(admin_id,action,target_id,note) VALUES(auth.uid(),'verification_'||p_decision,p_request_id,p_note);
END$$;
REVOKE ALL ON FUNCTION public.marketly_review_verification(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.marketly_review_verification(uuid,text,text) TO authenticated;

-- Existing chat RPCs are SECURITY DEFINER; lock them to approved listings too.
CREATE OR REPLACE FUNCTION public.start_conversation(p_listing_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user uuid:=auth.uid();v_seller uuid;v_id uuid;
BEGIN
 IF v_user IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
 SELECT seller_id INTO v_seller FROM public.listings WHERE id=p_listing_id AND status='active' AND moderation_status='approved';
 IF v_seller IS NULL THEN RAISE EXCEPTION 'LISTING_NOT_AVAILABLE'; END IF;
 IF v_user=v_seller THEN RAISE EXCEPTION 'CANNOT_CONTACT_YOURSELF'; END IF;
 INSERT INTO public.conversations(listing_id,buyer_id,seller_id)VALUES(p_listing_id,v_user,v_seller) ON CONFLICT(listing_id,buyer_id) DO NOTHING;
 SELECT id INTO v_id FROM public.conversations WHERE listing_id=p_listing_id AND buyer_id=v_user;
 RETURN v_id;
END$$;
REVOKE ALL ON FUNCTION public.start_conversation(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.start_conversation(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.make_offer(p_conversation_id uuid,p_amount_lkr bigint)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user uuid:=auth.uid();v_conv public.conversations%ROWTYPE;v_id uuid;
BEGIN
 IF v_user IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
 IF p_amount_lkr NOT BETWEEN 1 AND 999999999 THEN RAISE EXCEPTION 'INVALID_OFFER_AMOUNT'; END IF;
 SELECT * INTO v_conv FROM public.conversations WHERE id=p_conversation_id FOR UPDATE;
 IF NOT FOUND OR v_conv.buyer_id<>v_user THEN RAISE EXCEPTION 'ONLY_BUYER_CAN_OFFER'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.listings WHERE id=v_conv.listing_id AND status='active' AND moderation_status='approved') THEN RAISE EXCEPTION 'LISTING_NOT_AVAILABLE'; END IF;
 IF EXISTS(SELECT 1 FROM public.offers WHERE conversation_id=p_conversation_id AND status='pending') THEN RAISE EXCEPTION 'PENDING_OFFER_EXISTS'; END IF;
 INSERT INTO public.offers(conversation_id,buyer_id,amount_lkr)VALUES(p_conversation_id,v_user,p_amount_lkr) RETURNING id INTO v_id;
 UPDATE public.conversations SET last_message_at=now() WHERE id=p_conversation_id;
 INSERT INTO public.notifications(recipient_id,actor_id,conversation_id,kind,title)VALUES(v_conv.seller_id,v_user,p_conversation_id,'offer','You received a price offer');
 RETURN v_id;
END$$;
REVOKE ALL ON FUNCTION public.make_offer(uuid,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.make_offer(uuid,bigint) TO authenticated;

-- Prevent old privileged Phase 03 RPCs from bypassing moderation on edits/reports.
CREATE OR REPLACE FUNCTION public.respond_to_offer(p_offer_id uuid,p_accept boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user uuid:=auth.uid(); v_conv public.conversations%ROWTYPE; v_offer public.offers%ROWTYPE;
BEGIN
 IF v_user IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
 SELECT * INTO v_offer FROM public.offers WHERE id=p_offer_id FOR UPDATE;
 IF NOT FOUND OR v_offer.status<>'pending' THEN RAISE EXCEPTION 'OFFER_NOT_PENDING'; END IF;
 SELECT * INTO v_conv FROM public.conversations WHERE id=v_offer.conversation_id;
 IF NOT FOUND OR v_conv.seller_id<>v_user THEN RAISE EXCEPTION 'ONLY_SELLER_CAN_RESPOND'; END IF;
 IF p_accept AND NOT EXISTS(SELECT 1 FROM public.listings WHERE id=v_conv.listing_id AND status='active' AND moderation_status='approved') THEN RAISE EXCEPTION 'AD_NOT_AVAILABLE'; END IF;
 UPDATE public.offers SET status=CASE WHEN p_accept THEN 'accepted' ELSE 'declined' END,updated_at=now() WHERE id=p_offer_id;
 UPDATE public.conversations SET last_message_at=now() WHERE id=v_conv.id;
 INSERT INTO public.notifications(recipient_id,actor_id,conversation_id,kind,title)
 VALUES(v_conv.buyer_id,v_user,v_conv.id,CASE WHEN p_accept THEN 'offer_accepted' ELSE 'offer_declined' END,
 CASE WHEN p_accept THEN 'Your offer was accepted' ELSE 'Your offer was declined' END);
END$$;
REVOKE ALL ON FUNCTION public.respond_to_offer(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.respond_to_offer(uuid,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.toggle_favorite(p_listing_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user uuid:=auth.uid();
BEGIN
 IF v_user IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
 DELETE FROM public.favorites WHERE user_id=v_user AND listing_id=p_listing_id;
 IF FOUND THEN RETURN false; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.listings WHERE id=p_listing_id AND status='active' AND moderation_status='approved') THEN RAISE EXCEPTION 'AD_NOT_AVAILABLE'; END IF;
 INSERT INTO public.favorites(user_id,listing_id) VALUES(v_user,p_listing_id) ON CONFLICT(user_id,listing_id) DO NOTHING;
 RETURN true;
END$$;
REVOKE ALL ON FUNCTION public.toggle_favorite(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.toggle_favorite(uuid) TO authenticated;

COMMIT;
