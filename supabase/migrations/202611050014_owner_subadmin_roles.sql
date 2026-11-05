-- MARKETLY PHASE 08A - Owner/Super Admin + Sub Admin Access (after SQL 013)
-- REQUIREMENT: exactly one existing admin row, promoted to sole OWNER. Existing data is preserved.
-- Backup database BEFORE execution; apply ONCE using Supabase SQL Editor.
-- This is ROLE/PRIVILEGE infrastructure, not real payments or seller identity verification.
BEGIN;

ALTER TABLE public.marketly_admins
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'sub_admin',
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
DO $$ BEGIN
  IF (SELECT count(*) FROM public.marketly_admins)>1
     AND NOT EXISTS(SELECT 1 FROM public.marketly_admins WHERE role='owner') THEN
    RAISE EXCEPTION 'MULTIPLE_EXISTING_ADMINS: Choose owner manually before migration; no account was changed';
  END IF;
  IF (SELECT count(*) FROM public.marketly_admins)=1
     AND NOT EXISTS(SELECT 1 FROM public.marketly_admins WHERE role='owner') THEN
    UPDATE public.marketly_admins SET role='owner',is_active=true;
  END IF;
END $$;
ALTER TABLE public.marketly_admins DROP CONSTRAINT IF EXISTS marketly_admin_role_check;
ALTER TABLE public.marketly_admins ADD CONSTRAINT marketly_admin_role_check CHECK(role IN('owner','sub_admin'));
CREATE UNIQUE INDEX IF NOT EXISTS marketly_one_owner_idx ON public.marketly_admins ((role)) WHERE role='owner';
-- Never promote a second owner by app code. Owner transfers require a carefully audited SQL/ops procedure.

CREATE TABLE IF NOT EXISTS public.marketly_admin_permissions (
 user_id uuid NOT NULL REFERENCES public.marketly_admins(user_id) ON DELETE CASCADE,
 permission text NOT NULL CHECK(permission IN ('listings','reports','chat_reports','verification','billing_view','audit_view')),
 granted_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,permission)
);
ALTER TABLE public.marketly_admin_permissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.marketly_admin_permissions FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.marketly_is_owner() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS(
  SELECT 1 FROM public.marketly_admins WHERE user_id=auth.uid() AND role='owner' AND is_active
 );
$$;
REVOKE ALL ON FUNCTION public.marketly_is_owner() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.marketly_is_owner() TO authenticated;

CREATE OR REPLACE FUNCTION public.marketly_admin_has_permission(p_permission text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS(
 SELECT 1 FROM public.marketly_admins a WHERE a.user_id=auth.uid() AND a.is_active
 AND (a.role='owner' OR EXISTS(SELECT 1 FROM public.marketly_admin_permissions p
 WHERE p.user_id=a.user_id AND p.permission=p_permission)));
$$;
REVOKE ALL ON FUNCTION public.marketly_admin_has_permission(text) FROM PUBLIC,anon;
-- RLS public listings invokes this helper for anonymous viewers too; it returns false without auth.
GRANT EXECUTE ON FUNCTION public.marketly_admin_has_permission(text) TO anon,authenticated;

CREATE OR REPLACE FUNCTION public.marketly_is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS(SELECT 1 FROM public.marketly_admins
 WHERE user_id=auth.uid() AND is_active
 AND (role='owner' OR EXISTS(SELECT 1 FROM public.marketly_admin_permissions p
 WHERE p.user_id=marketly_admins.user_id)));
$$;
REVOKE ALL ON FUNCTION public.marketly_is_admin() FROM PUBLIC,anon;
-- Existing legacy RLS also uses this helper for anonymous public reads.
GRANT EXECUTE ON FUNCTION public.marketly_is_admin() TO anon,authenticated;

CREATE OR REPLACE FUNCTION public.marketly_admin_access() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_role text;v_active boolean;v_perms text[];
BEGIN
 SELECT a.role,a.is_active INTO v_role,v_active FROM public.marketly_admins a WHERE a.user_id=auth.uid();
 IF NOT FOUND OR NOT v_active THEN
  RETURN jsonb_build_object('role','user','permissions',jsonb_build_array(),'ownerBenefits',false,'isAdmin',false);
 END IF;
 IF v_role='owner' THEN
  v_perms:=ARRAY['listings','reports','chat_reports','verification','billing_view','audit_view'];
 ELSE
  SELECT coalesce(array_agg(p.permission ORDER BY p.permission),ARRAY[]::text[]) INTO v_perms
    FROM public.marketly_admin_permissions p WHERE p.user_id=auth.uid();
 END IF;
 RETURN jsonb_build_object('role',v_role,'permissions',to_jsonb(v_perms),
  'ownerBenefits',v_role='owner','isAdmin',v_role='owner' OR cardinality(v_perms)>0);
END $$;
REVOKE ALL ON FUNCTION public.marketly_admin_access() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.marketly_admin_access() TO authenticated;

-- Owner can find an EXISTING registered user by exact email. No public user enumeration.
CREATE OR REPLACE FUNCTION public.marketly_owner_find_user(p_email text)
RETURNS TABLE(id uuid,display_name text,email text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT public.marketly_is_owner() THEN RAISE EXCEPTION 'OWNER_ONLY'; END IF;
 IF p_email IS NULL OR length(trim(p_email)) NOT BETWEEN 5 AND 254 OR position('@' IN p_email)<2
 THEN RAISE EXCEPTION 'VALID_EMAIL_REQUIRED'; END IF;
 RETURN QUERY SELECT u.id,coalesce(p.display_name,''),u.email::text
 FROM auth.users u LEFT JOIN public.profiles p ON p.id=u.id
 WHERE lower(u.email)=lower(trim(p_email)) LIMIT 1;
END $$;
REVOKE ALL ON FUNCTION public.marketly_owner_find_user(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.marketly_owner_find_user(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.marketly_owner_list_admins()
RETURNS TABLE(user_id uuid,display_name text,email text,role text,is_active boolean,permissions text[],created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT public.marketly_is_owner() THEN RAISE EXCEPTION 'OWNER_ONLY'; END IF;
 RETURN QUERY SELECT a.user_id,coalesce(p.display_name,''),coalesce(u.email,'')::text,
   a.role,a.is_active,
   CASE WHEN a.role='owner' THEN ARRAY['listings','reports','chat_reports','verification','billing_view','audit_view']::text[]
   ELSE coalesce((SELECT array_agg(x.permission ORDER BY x.permission) FROM public.marketly_admin_permissions x WHERE x.user_id=a.user_id),ARRAY[]::text[]) END,
   a.created_at
 FROM public.marketly_admins a JOIN auth.users u ON u.id=a.user_id
 LEFT JOIN public.profiles p ON p.id=a.user_id
 ORDER BY (a.role='owner') DESC,a.created_at;
END $$;
REVOKE ALL ON FUNCTION public.marketly_owner_list_admins() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.marketly_owner_list_admins() TO authenticated;

CREATE OR REPLACE FUNCTION public.marketly_owner_manage_sub_admin(p_user_id uuid,p_action text,p_permissions text[] DEFAULT ARRAY[]::text[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_unique text[];v_role text;
BEGIN
 IF NOT public.marketly_is_owner() THEN RAISE EXCEPTION 'OWNER_ONLY'; END IF;
 IF p_user_id IS NULL OR p_user_id=auth.uid() THEN RAISE EXCEPTION 'INVALID_SUB_ADMIN'; END IF;
 IF p_action NOT IN ('save','suspend','activate','remove') THEN RAISE EXCEPTION 'INVALID_ADMIN_ACTION'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_user_id) THEN RAISE EXCEPTION 'REGISTERED_USER_REQUIRED'; END IF;
 SELECT a.role INTO v_role FROM public.marketly_admins a WHERE a.user_id=p_user_id FOR UPDATE;
 IF v_role='owner' THEN RAISE EXCEPTION 'OWNER_PROTECTED'; END IF;
 IF p_action='save' THEN
  SELECT coalesce(array_agg(DISTINCT x),ARRAY[]::text[]) INTO v_unique FROM unnest(coalesce(p_permissions,ARRAY[]::text[])) x;
  IF cardinality(v_unique)<1 OR EXISTS(SELECT 1 FROM unnest(v_unique) x
      WHERE x NOT IN ('listings','reports','chat_reports','verification','billing_view','audit_view'))
    THEN RAISE EXCEPTION 'SELECT_VALID_PERMISSIONS'; END IF;
  INSERT INTO public.marketly_admins(user_id,role,is_active)
   VALUES(p_user_id,'sub_admin',true)
   ON CONFLICT(user_id) DO UPDATE SET is_active=true WHERE marketly_admins.role='sub_admin';
  DELETE FROM public.marketly_admin_permissions WHERE user_id=p_user_id;
  INSERT INTO public.marketly_admin_permissions(user_id,permission) SELECT p_user_id,unnest(v_unique);
 ELSIF p_action='remove' THEN
  IF v_role IS DISTINCT FROM 'sub_admin' THEN RAISE EXCEPTION 'SUB_ADMIN_NOT_FOUND'; END IF;
  DELETE FROM public.marketly_admins WHERE user_id=p_user_id AND role='sub_admin';
 ELSE
  IF v_role IS DISTINCT FROM 'sub_admin' THEN RAISE EXCEPTION 'SUB_ADMIN_NOT_FOUND'; END IF;
  UPDATE public.marketly_admins SET is_active=(p_action='activate') WHERE user_id=p_user_id AND role='sub_admin';
 END IF;
 INSERT INTO public.marketly_admin_log(admin_id,action,target_id,note)
 VALUES(auth.uid(),'sub_admin_'||p_action,p_user_id,
   CASE WHEN p_action='save' THEN array_to_string(v_unique,',') ELSE null END);
END $$;
REVOKE ALL ON FUNCTION public.marketly_owner_manage_sub_admin(uuid,text,text[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.marketly_owner_manage_sub_admin(uuid,text,text[]) TO authenticated;

-- Least-privilege listing visibility: ad reviewers see pending ads; report reviewers
-- see ONLY listings that were reported, plus ordinary public/self listings.
-- SECURITY DEFINER is required because anon has no direct SELECT on listing_reports.
CREATE OR REPLACE FUNCTION public.marketly_can_moderate_listing(p_listing_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT public.marketly_admin_has_permission('listings') OR
   (public.marketly_admin_has_permission('reports') AND EXISTS(
      SELECT 1 FROM public.listing_reports WHERE listing_id=p_listing_id));
$$;
REVOKE ALL ON FUNCTION public.marketly_can_moderate_listing(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.marketly_can_moderate_listing(uuid) TO anon,authenticated;

-- Existing public reads stay public. Only suitably authorized admins access restricted records.
DROP POLICY IF EXISTS "Public sees approved ads, owners and admins see theirs" ON public.listings;
CREATE POLICY "Public sees approved ads, owners and admins see theirs" ON public.listings
 FOR SELECT TO anon,authenticated USING(
 (status='active' AND moderation_status='approved') OR seller_id=(SELECT auth.uid())
 OR public.marketly_can_moderate_listing(id));
DROP POLICY IF EXISTS "Images follow listing visibility" ON public.listing_images;
CREATE POLICY "Images follow listing visibility" ON public.listing_images
 FOR SELECT TO anon,authenticated USING(EXISTS(
 SELECT 1 FROM public.listings l WHERE l.id=listing_id));
DROP POLICY IF EXISTS "Reporters and admins see reports" ON public.listing_reports;
CREATE POLICY "Reporters and assigned admins see reports" ON public.listing_reports
 FOR SELECT TO authenticated USING(reporter_id=(SELECT auth.uid()) OR public.marketly_admin_has_permission('reports'));
DROP POLICY IF EXISTS "Request owner and admins can see" ON public.seller_verification_requests;
CREATE POLICY "Request owner and assigned admins see" ON public.seller_verification_requests
 FOR SELECT TO authenticated USING(seller_id=(SELECT auth.uid()) OR public.marketly_admin_has_permission('verification'));
DROP POLICY IF EXISTS "Chat reports by reporter or admin" ON public.marketly_chat_reports;
CREATE POLICY "Chat reports by reporter or assigned admin" ON public.marketly_chat_reports
 FOR SELECT TO authenticated USING(reporter_id=(SELECT auth.uid()) OR public.marketly_admin_has_permission('chat_reports'));
DROP POLICY IF EXISTS "Only admins see audit log" ON public.marketly_admin_log;
CREATE POLICY "Owner auditors and own admin activity" ON public.marketly_admin_log
 FOR SELECT TO authenticated USING(admin_id=(SELECT auth.uid()) OR public.marketly_admin_has_permission('audit_view'));
DROP POLICY IF EXISTS "Owners and admins read simulated purchases" ON public.marketly_test_orders;
CREATE POLICY "Own purchases or authorized billing auditors" ON public.marketly_test_orders
 FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()) OR public.marketly_admin_has_permission('billing_view'));
DROP POLICY IF EXISTS "Sandbox payments visible to owner and admin" ON public.marketly_sandbox_payments;
CREATE POLICY "Own sandbox payments or billing auditors" ON public.marketly_sandbox_payments
 FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()) OR public.marketly_admin_has_permission('billing_view'));
DROP POLICY IF EXISTS "Sandbox entitlements visible to owner and admin" ON public.marketly_sandbox_entitlements;
CREATE POLICY "Own entitlements or billing auditors" ON public.marketly_sandbox_entitlements
 FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()) OR public.marketly_admin_has_permission('billing_view'));

-- Keep the tested original moderation business logic untouched, behind NEW permission wrappers.
DO $$ BEGIN
 IF to_regprocedure('public.marketly_review_listing_before_roles(uuid,text,text)') IS NULL THEN
  ALTER FUNCTION public.marketly_review_listing(uuid,text,text) RENAME TO marketly_review_listing_before_roles;
 END IF;
 IF to_regprocedure('public.marketly_review_report_before_roles(uuid,text,text)') IS NULL THEN
  ALTER FUNCTION public.marketly_review_report(uuid,text,text) RENAME TO marketly_review_report_before_roles;
 END IF;
 IF to_regprocedure('public.marketly_review_verification_before_roles(uuid,text,text)') IS NULL THEN
  ALTER FUNCTION public.marketly_review_verification(uuid,text,text) RENAME TO marketly_review_verification_before_roles;
 END IF;
 IF to_regprocedure('public.marketly_review_chat_report_before_roles(uuid,text)') IS NULL THEN
  ALTER FUNCTION public.marketly_review_chat_report(uuid,text) RENAME TO marketly_review_chat_report_before_roles;
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.marketly_review_listing_before_roles(uuid,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.marketly_review_report_before_roles(uuid,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.marketly_review_verification_before_roles(uuid,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.marketly_review_chat_report_before_roles(uuid,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.marketly_review_listing(p_listing_id uuid,p_decision text,p_note text DEFAULT '')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT public.marketly_admin_has_permission('listings') THEN RAISE EXCEPTION 'ADMIN_PERMISSION_REQUIRED'; END IF;
 IF EXISTS(SELECT 1 FROM public.listings WHERE id=p_listing_id AND seller_id=auth.uid()) THEN RAISE EXCEPTION 'SELF_REVIEW_NOT_ALLOWED'; END IF;
 PERFORM public.marketly_review_listing_before_roles(p_listing_id,p_decision,p_note);
END $$;
REVOKE ALL ON FUNCTION public.marketly_review_listing(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.marketly_review_listing(uuid,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.marketly_review_report(p_report_id uuid,p_action text,p_note text DEFAULT '')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT public.marketly_admin_has_permission('reports') THEN RAISE EXCEPTION 'ADMIN_PERMISSION_REQUIRED'; END IF;
 IF EXISTS(SELECT 1 FROM public.listing_reports r JOIN public.listings l ON l.id=r.listing_id
  WHERE r.id=p_report_id AND l.seller_id=auth.uid()) THEN RAISE EXCEPTION 'SELF_REVIEW_NOT_ALLOWED'; END IF;
 PERFORM public.marketly_review_report_before_roles(p_report_id,p_action,p_note);
END $$;
REVOKE ALL ON FUNCTION public.marketly_review_report(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.marketly_review_report(uuid,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.marketly_review_verification(p_request_id uuid,p_decision text,p_note text DEFAULT '')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT public.marketly_admin_has_permission('verification') THEN RAISE EXCEPTION 'ADMIN_PERMISSION_REQUIRED'; END IF;
 IF EXISTS(SELECT 1 FROM public.seller_verification_requests WHERE id=p_request_id AND seller_id=auth.uid()) THEN RAISE EXCEPTION 'SELF_REVIEW_NOT_ALLOWED'; END IF;
 PERFORM public.marketly_review_verification_before_roles(p_request_id,p_decision,p_note);
END $$;
REVOKE ALL ON FUNCTION public.marketly_review_verification(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.marketly_review_verification(uuid,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.marketly_review_chat_report(p_report_id uuid,p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT public.marketly_admin_has_permission('chat_reports') THEN RAISE EXCEPTION 'ADMIN_PERMISSION_REQUIRED'; END IF;
 IF EXISTS(SELECT 1 FROM public.marketly_chat_reports WHERE id=p_report_id AND reporter_id=auth.uid()) THEN RAISE EXCEPTION 'SELF_REVIEW_NOT_ALLOWED'; END IF;
 PERFORM public.marketly_review_chat_report_before_roles(p_report_id,p_status);
 INSERT INTO public.marketly_admin_log(admin_id,action,target_id) VALUES(auth.uid(),'chat_report_'||p_status,p_report_id);
END $$;
REVOKE ALL ON FUNCTION public.marketly_review_chat_report(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.marketly_review_chat_report(uuid,text) TO authenticated;

-- All admins can still use marketplace as sellers, but only OWNER gets fee waiver.
-- Hard safety cap stays 12 photos/listing, 5 MB/file; real paid extra photos remain disabled.
ALTER TABLE public.marketly_listing_drafts DROP CONSTRAINT IF EXISTS marketly_draft_image_count;
ALTER TABLE public.marketly_listing_drafts ADD CONSTRAINT marketly_draft_image_count
 CHECK(cardinality(image_paths)<=12 AND cardinality(image_paths)=cardinality(preview_paths));

-- Owner promotional boost: real owner-only expiry/sort, NO fictitious paid order.
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS owner_boost_until timestamptz;
CREATE INDEX IF NOT EXISTS marketly_approved_owner_boost_idx
 ON public.listings(owner_boost_until DESC NULLS LAST,published_at DESC)
 WHERE status='active' AND moderation_status='approved';
CREATE OR REPLACE FUNCTION public.marketly_owner_boost_listing(p_listing_id uuid,p_days integer)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_until timestamptz;
BEGIN
 IF NOT public.marketly_is_owner() THEN RAISE EXCEPTION 'OWNER_ONLY'; END IF;
 IF p_days NOT IN(7,14,30) THEN RAISE EXCEPTION 'INVALID_BOOST_DURATION'; END IF;
 UPDATE public.listings
 SET owner_boost_until=greatest(coalesce(owner_boost_until,now()),now())+make_interval(days=>p_days)
 WHERE id=p_listing_id AND seller_id=auth.uid() AND status='active' AND moderation_status='approved'
 RETURNING owner_boost_until INTO v_until;
 IF v_until IS NULL THEN RAISE EXCEPTION 'OWN_APPROVED_ACTIVE_LISTING_REQUIRED'; END IF;
 INSERT INTO public.marketly_admin_log(admin_id,action,target_id,note)
 VALUES(auth.uid(),'owner_free_boost',p_listing_id,p_days||' days, fee waived');
 RETURN v_until;
END $$;
REVOKE ALL ON FUNCTION public.marketly_owner_boost_listing(uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.marketly_owner_boost_listing(uuid,integer) TO authenticated;

-- RLS-safe public listing feed. Expired owner boosts stop ranking at their expiry,
-- without cron jobs or mutating users' listings.
CREATE OR REPLACE VIEW public.marketly_listing_feed WITH (security_invoker=true,security_barrier=true) AS
 SELECT l.*,CASE WHEN l.owner_boost_until>now() THEN l.owner_boost_until ELSE null END AS active_owner_boost_sort
 FROM public.listings l;
REVOKE ALL ON public.marketly_listing_feed FROM PUBLIC;
GRANT SELECT ON public.marketly_listing_feed TO anon,authenticated;

-- Notification fan-out: only active users authorized for each queue get alerts.
CREATE OR REPLACE FUNCTION public.marketly_notify_admin_new_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF TG_TABLE_NAME='listing_reports' THEN
   INSERT INTO public.notifications(recipient_id,actor_id,listing_id,kind,title)
   SELECT a.user_id,NEW.reporter_id,NEW.listing_id,'admin_report','A listing has been reported'
   FROM public.marketly_admins a JOIN public.profiles p ON p.id=a.user_id
   WHERE a.is_active AND (a.role='owner' OR EXISTS(SELECT 1 FROM public.marketly_admin_permissions ap WHERE ap.user_id=a.user_id AND ap.permission='reports'));
 ELSIF TG_TABLE_NAME='seller_verification_requests' THEN
   INSERT INTO public.notifications(recipient_id,actor_id,kind,title)
   SELECT a.user_id,NEW.seller_id,'admin_verification','New seller verification request'
   FROM public.marketly_admins a JOIN public.profiles p ON p.id=a.user_id
   WHERE a.is_active AND (a.role='owner' OR EXISTS(SELECT 1 FROM public.marketly_admin_permissions ap WHERE ap.user_id=a.user_id AND ap.permission='verification'));
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.marketly_notify_admin_new_request() FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.marketly_notify_admin_chat_report()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 INSERT INTO public.notifications(recipient_id,actor_id,kind,title)
 SELECT a.user_id,NEW.reporter_id,'admin_chat_report',left('New chat report awaiting review ('||NEW.reason||')',140)
 FROM public.marketly_admins a JOIN public.profiles p ON p.id=a.user_id
 WHERE a.is_active AND (a.role='owner' OR EXISTS(SELECT 1 FROM public.marketly_admin_permissions ap WHERE ap.user_id=a.user_id AND ap.permission='chat_reports'));
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.marketly_notify_admin_chat_report() FROM PUBLIC,anon,authenticated;

-- Authoritative owner fee waiver, existing validated publishing logic retained.
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
 IF v_n NOT BETWEEN 1 AND (CASE WHEN public.marketly_is_owner() THEN 12 ELSE 5 END) OR coalesce(cardinality(p_preview_paths),0)<>v_n THEN RAISE EXCEPTION 'EXTRA_IMAGE_PAYMENT_REQUIRED'; END IF;
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
 IF NOT public.marketly_is_owner() AND (SELECT count(*) FROM public.listing_post_ledger WHERE seller_id=v_user AND billing_month=v_month)>=3 THEN RAISE EXCEPTION 'FREE_AD_QUOTA_EXCEEDED'; END IF;
 INSERT INTO public.listings(seller_id,title,description,price_lkr,category,location,condition,is_negotiable,status,moderation_status)
 VALUES(v_user,btrim(p_title),btrim(p_description),p_price_lkr,p_category,p_location,p_condition,p_is_negotiable,'active','pending') RETURNING id INTO v_id;
 FOR v_i IN 1..v_n LOOP
  INSERT INTO public.listing_images(listing_id,storage_path,preview_storage_path,position)
  VALUES(v_id,p_image_paths[v_i],p_preview_paths[v_i],v_i-1);
 END LOOP;
 INSERT INTO public.listing_post_ledger(seller_id,listing_id,billing_month)VALUES(v_user,v_id,v_month);
 RETURN v_id;
END$$;

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
  IF v_n NOT BETWEEN 1 AND (CASE WHEN public.marketly_is_owner() THEN 12 ELSE 5 END) OR coalesce(cardinality(p_preview_paths),0)<>v_n THEN RAISE EXCEPTION 'EXTRA_IMAGE_PAYMENT_REQUIRED'; END IF;
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

CREATE OR REPLACE FUNCTION public.marketly_save_listing_draft(
 p_draft_id uuid,p_title text,p_description text,p_price_lkr bigint,
 p_category text,p_location text,p_condition text,p_is_negotiable boolean,
 p_image_paths text[],p_preview_paths text[]
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,storage,pg_temp AS $$
DECLARE v_owner uuid:=auth.uid(); v_id uuid; v_count int; v_i int; v_prev record;
BEGIN
 IF v_owner IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=v_owner) THEN RAISE EXCEPTION 'LOGIN_REQUIRED'; END IF;
 IF length(coalesce(p_title,''))>90 OR length(coalesce(p_description,''))>2500
 OR (p_price_lkr IS NOT NULL AND p_price_lkr NOT BETWEEN 1 AND 999999999)
 OR (p_category IS NOT NULL AND p_category NOT IN('Mobiles','Vehicles','Property','Electronics','Home & Living','Fashion','Services','Other'))
 OR (p_location IS NOT NULL AND p_location NOT IN('Colombo','Gampaha','Kalutara','Kandy','Matale','Nuwara Eliya','Galle','Matara','Hambantota','Jaffna','Kilinochchi','Mannar','Mullaitivu','Vavuniya','Trincomalee','Batticaloa','Ampara','Kurunegala','Puttalam','Anuradhapura','Polonnaruwa','Badulla','Monaragala','Ratnapura','Kegalle'))
 OR (p_condition IS NOT NULL AND p_condition NOT IN('New','Used','Refurbished'))
 OR p_is_negotiable IS NULL THEN RAISE EXCEPTION 'INVALID_DRAFT_FIELDS'; END IF;
 v_count:=coalesce(cardinality(p_image_paths),0);
 IF v_count>(CASE WHEN public.marketly_is_owner() THEN 12 ELSE 5 END) OR coalesce(cardinality(p_preview_paths),0)<>v_count THEN RAISE EXCEPTION 'MAX_FIVE_FREE_PHOTOS'; END IF;
 IF (SELECT count(DISTINCT x) FROM unnest(coalesce(p_image_paths,ARRAY[]::text[])) x)<>v_count
 OR (SELECT count(DISTINCT x) FROM unnest(coalesce(p_preview_paths,ARRAY[]::text[])) x)<>v_count THEN RAISE EXCEPTION 'DUPLICATE_DRAFT_PHOTO'; END IF;
 -- Serialize saves from multiple tabs and prevent using the same stored image in two drafts.
 PERFORM pg_advisory_xact_lock(hashtext(v_owner::text), hashtext('marketly-draft-photo'));
 IF p_draft_id IS NOT NULL THEN
  SELECT id INTO v_id FROM public.marketly_listing_drafts WHERE id=p_draft_id AND seller_id=v_owner FOR UPDATE;
  IF v_id IS NULL THEN RAISE EXCEPTION 'DRAFT_NOT_FOUND_OR_NOT_YOURS'; END IF;
 ELSE
  IF (SELECT count(*) FROM public.marketly_listing_drafts WHERE seller_id=v_owner)>=10 THEN RAISE EXCEPTION 'MAX_TEN_DRAFTS'; END IF;
 END IF;
 FOR v_i IN 1..v_count LOOP
  IF p_image_paths[v_i] IS NULL OR p_preview_paths[v_i] IS NULL
  OR split_part(p_image_paths[v_i],'/',1)<>v_owner::text
  OR split_part(p_preview_paths[v_i],'/',1)<>v_owner::text
  OR p_image_paths[v_i]=p_preview_paths[v_i]
  OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='listing-images' AND name=p_image_paths[v_i])
  OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='listing-images' AND name=p_preview_paths[v_i])
  OR EXISTS(SELECT 1 FROM public.listing_images WHERE storage_path=p_image_paths[v_i] OR preview_storage_path=p_preview_paths[v_i])
  OR EXISTS(SELECT 1 FROM public.marketly_listing_drafts d
    WHERE d.id IS DISTINCT FROM p_draft_id AND (p_image_paths[v_i]=ANY(d.image_paths) OR p_preview_paths[v_i]=ANY(d.preview_paths)))
  THEN RAISE EXCEPTION 'INVALID_DRAFT_IMAGE_OWNERSHIP'; END IF;
 END LOOP;
 IF v_id IS NULL THEN
  INSERT INTO public.marketly_listing_drafts(seller_id,title,description,price_lkr,category,location,condition,is_negotiable,image_paths,preview_paths)
  VALUES(v_owner,coalesce(p_title,''),coalesce(p_description,''),p_price_lkr,p_category,p_location,p_condition,p_is_negotiable,
   coalesce(p_image_paths,ARRAY[]::text[]),coalesce(p_preview_paths,ARRAY[]::text[])) RETURNING id INTO v_id;
 ELSE
  UPDATE public.marketly_listing_drafts SET title=coalesce(p_title,''),description=coalesce(p_description,''),price_lkr=p_price_lkr,
   category=p_category,location=p_location,condition=p_condition,is_negotiable=p_is_negotiable,
   image_paths=coalesce(p_image_paths,ARRAY[]::text[]),preview_paths=coalesce(p_preview_paths,ARRAY[]::text[]),updated_at=now()
  WHERE id=v_id;
 END IF;
 RETURN v_id;
END$$;

CREATE OR REPLACE FUNCTION public.marketly_manage_listing_photos(p_listing_id uuid,p_ordered_paths text[])
RETURNS text[] LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_owner uuid:=auth.uid(); v_old_count int; v_count int; v_i int;
 v_path text; v_removed text[]:=ARRAY[]::text[]; v_row record;
 v_old_paths text[]; v_old_previews text[];
BEGIN
 IF v_owner IS NULL THEN RAISE EXCEPTION 'LOGIN_REQUIRED'; END IF;
 PERFORM 1 FROM public.listings WHERE id=p_listing_id AND seller_id=v_owner AND status<>'deleted' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'AD_NOT_FOUND_OR_DELETED'; END IF;
 SELECT count(*) INTO v_old_count FROM public.listing_images WHERE listing_id=p_listing_id;
 v_count:=coalesce(cardinality(p_ordered_paths),0);
 IF v_count<1 OR v_count>(CASE WHEN public.marketly_is_owner() THEN 12 ELSE 5 END) OR v_count>v_old_count OR
  (SELECT count(DISTINCT x) FROM unnest(coalesce(p_ordered_paths,ARRAY[]::text[])) x)<>v_count
 THEN RAISE EXCEPTION 'INVALID_PHOTO_ORDER'; END IF;
 FOREACH v_path IN ARRAY p_ordered_paths LOOP
  IF NOT EXISTS(SELECT 1 FROM public.listing_images WHERE listing_id=p_listing_id AND storage_path=v_path) THEN
   RAISE EXCEPTION 'PHOTO_DOES_NOT_BELONG_TO_AD'; END IF;
 END LOOP;
 -- Old image paths are known to belong to this listing. Keep pairs together.
 FOR v_row IN SELECT storage_path,preview_storage_path FROM public.listing_images WHERE listing_id=p_listing_id LOOP
  IF NOT (v_row.storage_path=ANY(p_ordered_paths)) THEN
   v_removed:=array_append(v_removed,v_row.storage_path);
   IF v_row.preview_storage_path IS NOT NULL THEN v_removed:=array_append(v_removed,v_row.preview_storage_path); END IF;
  END IF;
 END LOOP;
 -- Existing (listing_id, position) UNIQUE is immediate. Snapshot into arrays
 -- before deleting/reinserting all image records in this same transaction.
 SELECT array_agg(storage_path ORDER BY position),array_agg(preview_storage_path ORDER BY position)
 INTO v_old_paths,v_old_previews FROM public.listing_images WHERE listing_id=p_listing_id;
 DELETE FROM public.listing_images WHERE listing_id=p_listing_id;
 FOR v_i IN 1..v_count LOOP
  INSERT INTO public.listing_images(listing_id,storage_path,preview_storage_path,position)
  VALUES(p_listing_id,p_ordered_paths[v_i],v_old_previews[array_position(v_old_paths,p_ordered_paths[v_i])],v_i-1);
 END LOOP;
 IF v_count<v_old_count THEN
  UPDATE public.listings SET moderation_status='pending',moderation_note=NULL,reviewed_at=NULL
  WHERE id=p_listing_id;
 END IF;
 RETURN v_removed;
END$$;

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
    FROM public.marketly_admins a JOIN public.profiles p ON p.id=a.user_id
    WHERE a.is_active AND (a.role='owner' OR EXISTS(SELECT 1 FROM public.marketly_admin_permissions ap WHERE ap.user_id=a.user_id AND ap.permission='listings'));
  END IF;
  RETURN NEW;
END$$;
COMMIT;
