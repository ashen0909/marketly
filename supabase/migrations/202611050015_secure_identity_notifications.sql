-- MARKETLY PHASE 08B — secure evidence review and targeted notifications.
-- REQUIRES MIGRATIONS 001–014. Back up the database before running.
-- This migration does NOT grant identity verification automatically.
BEGIN;

-- Existing legacy pending requests remain reviewable but cannot be approved without identity evidence.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.seller_verification_requests
             WHERE status='pending' GROUP BY seller_id HAVING count(*)>1) THEN
    RAISE EXCEPTION 'PHASE08B_MULTIPLE_LEGACY_PENDING: resolve duplicate legacy pending requests before migration';
  END IF;
END $$;

ALTER TABLE public.seller_verification_requests DROP CONSTRAINT IF EXISTS seller_verification_requests_status_check;
ALTER TABLE public.seller_verification_requests DROP CONSTRAINT IF EXISTS seller_verification_status_v08b;
ALTER TABLE public.seller_verification_requests ADD CONSTRAINT seller_verification_status_v08b
  CHECK (status IN ('pending','approved','rejected','changes_requested','suspended'));
ALTER TABLE public.seller_verification_requests ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 1 CHECK(revision>=1);
ALTER TABLE public.seller_verification_requests ADD COLUMN IF NOT EXISTS escalated_at timestamptz;
ALTER TABLE public.seller_verification_requests ADD COLUMN IF NOT EXISTS escalated_note text;
CREATE UNIQUE INDEX IF NOT EXISTS marketly_one_pending_request_per_seller
 ON public.seller_verification_requests(seller_id) WHERE status='pending';

CREATE TABLE IF NOT EXISTS public.marketly_identity_submissions (
 request_id uuid PRIMARY KEY REFERENCES public.seller_verification_requests(id) ON DELETE CASCADE,
 seller_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 legal_name text NOT NULL CHECK (char_length(legal_name) BETWEEN 3 AND 120),
 nic_last4 text NOT NULL CHECK (nic_last4 ~ '^[0-9VX]{4}$'),
 nic_fingerprint text NOT NULL CHECK (nic_fingerprint ~ '^[a-f0-9]{64}$'),
 front_path text,back_path text,selfie_path text,
 submitted_at timestamptz NOT NULL DEFAULT now(),
 purge_after timestamptz,documents_purged_at timestamptz,
 CONSTRAINT distinct_identity_paths CHECK(front_path IS DISTINCT FROM back_path
   AND front_path IS DISTINCT FROM selfie_path AND back_path IS DISTINCT FROM selfie_path)
);
CREATE INDEX IF NOT EXISTS marketly_identity_fingerprint_idx ON public.marketly_identity_submissions(nic_fingerprint);
CREATE INDEX IF NOT EXISTS marketly_identity_purge_idx ON public.marketly_identity_submissions(purge_after)
 WHERE documents_purged_at IS NULL AND purge_after IS NOT NULL;
ALTER TABLE public.marketly_identity_submissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.marketly_identity_submissions FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.marketly_identity_submissions TO authenticated;
DROP POLICY IF EXISTS "Identity evidence restricted" ON public.marketly_identity_submissions;
CREATE POLICY "Identity evidence restricted" ON public.marketly_identity_submissions FOR SELECT TO authenticated
 USING(seller_id=(SELECT auth.uid()) OR public.marketly_admin_has_permission('verification'));

-- Reviewers can read private profile details only for submitted identity reviews.
DROP POLICY IF EXISTS "Authorized identity reviewers see applicant details" ON public.marketly_profile_details;
CREATE POLICY "Authorized identity reviewers see applicant details" ON public.marketly_profile_details
 FOR SELECT TO authenticated USING(public.marketly_admin_has_permission('verification')
 AND EXISTS(SELECT 1 FROM public.marketly_identity_submissions i WHERE i.seller_id=user_id));

-- Private identity bucket. Do NOT change public=false.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 VALUES('marketly-identity-private','marketly-identity-private',false,4194304,
 ARRAY['image/jpeg','image/png','image/webp'])
 ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=4194304,
  allowed_mime_types=EXCLUDED.allowed_mime_types;
DROP POLICY IF EXISTS "Marketly identity upload own private folder" ON storage.objects;
CREATE POLICY "Marketly identity upload own private folder" ON storage.objects
 FOR INSERT TO authenticated WITH CHECK(bucket_id='marketly-identity-private'
  AND (storage.foldername(name))[1]=(SELECT auth.uid())::text);
DROP POLICY IF EXISTS "Marketly identity owners and reviewers read" ON storage.objects;
CREATE POLICY "Marketly identity owners and reviewers read" ON storage.objects
 FOR SELECT TO authenticated USING(bucket_id='marketly-identity-private' AND
  ((storage.foldername(name))[1]=(SELECT auth.uid())::text OR
   (public.marketly_admin_has_permission('verification') AND EXISTS (
    SELECT 1 FROM public.marketly_identity_submissions i
    JOIN public.seller_verification_requests r ON r.id=i.request_id
    WHERE (i.front_path=name OR i.back_path=name OR i.selfie_path=name)
      AND i.seller_id<>(SELECT auth.uid())))));
-- Owners may delete only THEIR OWN uploaded images; admins cannot delete evidence via browser.
DROP POLICY IF EXISTS "Marketly identity owner remove own uploads" ON storage.objects;
CREATE POLICY "Marketly identity owner remove own uploads" ON storage.objects
 FOR DELETE TO authenticated USING(bucket_id='marketly-identity-private' AND
 (storage.foldername(name))[1]=(SELECT auth.uid())::text AND NOT EXISTS (
  SELECT 1 FROM public.marketly_identity_submissions i
  WHERE i.front_path=name OR i.back_path=name OR i.selfie_path=name));

-- The old text-only RPC must not create verification requests without evidence.
REVOKE ALL ON FUNCTION public.marketly_request_verification(text,text) FROM authenticated,anon,PUBLIC;

CREATE OR REPLACE FUNCTION public.marketly_submit_identity(
 p_legal_name text,p_nic_last4 text,p_nic_fingerprint text,
 p_front_path text,p_back_path text,p_selfie_path text,p_comment text DEFAULT '')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,storage,pg_temp AS $$
DECLARE v_uid uuid:=auth.uid();v_request uuid;v_change_request uuid;v_path text;v_existing uuid;
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
 IF NOT public.marketly_profile_is_complete(v_uid) OR NOT EXISTS(
   SELECT 1 FROM auth.users WHERE id=v_uid AND email_confirmed_at IS NOT NULL)
  THEN RAISE EXCEPTION 'COMPLETE_PROFILE_AND_EMAIL_FIRST'; END IF;
 IF EXISTS(SELECT 1 FROM public.profiles WHERE id=v_uid AND identity_verified)
  THEN RAISE EXCEPTION 'ALREADY_VERIFIED'; END IF;
 IF char_length(btrim(coalesce(p_legal_name,''))) NOT BETWEEN 3 AND 120
 OR p_nic_last4 !~ '^[0-9VX]{4}$' OR p_nic_fingerprint !~ '^[a-f0-9]{64}$'
 OR char_length(coalesce(p_comment,''))>400
 THEN RAISE EXCEPTION 'INVALID_IDENTITY_FIELDS'; END IF;
 FOREACH v_path IN ARRAY ARRAY[p_front_path,p_back_path,p_selfie_path] LOOP
  IF v_path IS NULL OR left(v_path,char_length(v_uid::text)+1) <> v_uid::text||'/'
    OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='marketly-identity-private' AND name=v_path)
   THEN RAISE EXCEPTION 'IDENTITY_DOCUMENT_MISSING'; END IF;
 END LOOP;
 IF p_front_path=p_back_path OR p_front_path=p_selfie_path OR p_back_path=p_selfie_path
   THEN RAISE EXCEPTION 'DISTINCT_IDENTITY_PHOTOS_REQUIRED'; END IF;
 -- Serialize submission per account, so double clicks cannot create concurrent requests.
 PERFORM pg_advisory_xact_lock(hashtextextended(v_uid::text,7189));
 SELECT r.id INTO v_existing FROM public.seller_verification_requests r
  WHERE r.seller_id=v_uid AND r.status='pending' ORDER BY r.created_at DESC LIMIT 1;
 IF v_existing IS NOT NULL THEN
   -- A legacy text-only pending request must never silently count as evidence review.
   IF NOT EXISTS(SELECT 1 FROM public.marketly_identity_submissions WHERE request_id=v_existing)
     THEN RAISE EXCEPTION 'LEGACY_REQUEST_NEEDS_REVIEW'; END IF;
   -- Returning same request is idempotent; the API will clean up the unused new upload.
   RETURN v_existing;
 END IF;
 IF (SELECT count(*) FROM public.seller_verification_requests WHERE seller_id=v_uid AND created_at>now()-interval '1 day')>=5
  THEN RAISE EXCEPTION 'VERIFICATION_RATE_LIMIT'; END IF;
 SELECT r.id INTO v_change_request FROM public.seller_verification_requests r
   WHERE r.seller_id=v_uid AND r.kind='identity' AND r.status='changes_requested'
   ORDER BY r.created_at DESC LIMIT 1 FOR UPDATE;
 IF v_change_request IS NOT NULL THEN
  v_request:=v_change_request;
  UPDATE public.seller_verification_requests SET status='pending',revision=revision+1,
    admin_note=NULL,reviewed_at=NULL,escalated_at=NULL,escalated_note=NULL
    WHERE id=v_request;
 ELSE
  INSERT INTO public.seller_verification_requests(seller_id,kind,details)
  VALUES(v_uid,'identity',left(btrim(coalesce(p_comment,'')),400)) RETURNING id INTO v_request;
 END IF;
 INSERT INTO public.marketly_identity_submissions(request_id,seller_id,legal_name,nic_last4,nic_fingerprint,
 front_path,back_path,selfie_path,submitted_at,purge_after,documents_purged_at)
 VALUES(v_request,v_uid,btrim(p_legal_name),p_nic_last4,p_nic_fingerprint,p_front_path,p_back_path,p_selfie_path,now(),NULL,NULL)
 ON CONFLICT(request_id) DO UPDATE SET legal_name=EXCLUDED.legal_name,nic_last4=EXCLUDED.nic_last4,
 nic_fingerprint=EXCLUDED.nic_fingerprint,front_path=EXCLUDED.front_path,back_path=EXCLUDED.back_path,
 selfie_path=EXCLUDED.selfie_path,submitted_at=now(),purge_after=NULL,documents_purged_at=NULL;
 RETURN v_request;
END $$;
REVOKE ALL ON FUNCTION public.marketly_submit_identity(text,text,text,text,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.marketly_submit_identity(text,text,text,text,text,text,text) TO authenticated;

-- One-click preliminary review. This does NOT authenticate the NIC or match faces.
CREATE OR REPLACE FUNCTION public.marketly_identity_precheck(p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,storage,pg_temp AS $$
DECLARE v record;v_name text;v_duplicates integer;v_front boolean;v_back boolean;v_selfie boolean;
BEGIN
 IF NOT public.marketly_admin_has_permission('verification') THEN RAISE EXCEPTION 'ADMIN_PERMISSION_REQUIRED'; END IF;
 SELECT i.*,r.status INTO v FROM public.marketly_identity_submissions i
 JOIN public.seller_verification_requests r ON r.id=i.request_id WHERE i.request_id=p_request_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'IDENTITY_EVIDENCE_NOT_FOUND'; END IF;
 SELECT lower(regexp_replace(coalesce(full_name,''),'[^a-zA-Z ]','','g')) INTO v_name
 FROM public.marketly_profile_details WHERE user_id=v.seller_id;
 SELECT count(*) INTO v_duplicates FROM public.marketly_identity_submissions i
 WHERE i.nic_fingerprint=v.nic_fingerprint AND i.seller_id<>v.seller_id;
 SELECT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='marketly-identity-private' AND name=v.front_path),
 EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='marketly-identity-private' AND name=v.back_path),
 EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='marketly-identity-private' AND name=v.selfie_path)
 INTO v_front,v_back,v_selfie;
 RETURN jsonb_build_object('documents_present',v_front AND v_back AND v_selfie,
 'nic_format_valid',v.nic_last4 ~ '^[0-9VX]{4}$',
 'name_matches_profile',(v_name<>'' AND v_name=lower(regexp_replace(coalesce(v.legal_name,''),'[^a-zA-Z ]','','g'))),
 'possible_duplicate_identity',v_duplicates>0,
 'manual_nic_authenticity_required',true,'manual_face_comparison_required',true,
 'document_clarity_manual_review',true);
END $$;
REVOKE ALL ON FUNCTION public.marketly_identity_precheck(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.marketly_identity_precheck(uuid) TO authenticated;

-- In-app preview actions create an audit record. Storage provider may log other access separately.
CREATE OR REPLACE FUNCTION public.marketly_log_identity_preview(p_request_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT public.marketly_admin_has_permission('verification') THEN RAISE EXCEPTION 'ADMIN_PERMISSION_REQUIRED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.marketly_identity_submissions WHERE request_id=p_request_id)
  THEN RAISE EXCEPTION 'IDENTITY_EVIDENCE_NOT_FOUND'; END IF;
 INSERT INTO public.marketly_admin_log(admin_id,action,target_id,note)
 VALUES(auth.uid(),'identity_document_preview',p_request_id,'Authorized in-app document preview');
END $$;
REVOKE ALL ON FUNCTION public.marketly_log_identity_preview(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.marketly_log_identity_preview(uuid) TO authenticated;

-- Target IDs are never freeform URLs; the UI constructs allowlisted local routes.
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS verification_request_id uuid
  REFERENCES public.seller_verification_requests(id) ON DELETE SET NULL;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS report_id uuid
  REFERENCES public.listing_reports(id) ON DELETE SET NULL;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS chat_report_id uuid
  REFERENCES public.marketly_chat_reports(id) ON DELETE SET NULL;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS event_key text;
CREATE UNIQUE INDEX IF NOT EXISTS marketly_notification_one_per_event
  ON public.notifications(recipient_id,event_key) WHERE event_key IS NOT NULL;
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_kind_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_kind_check CHECK(kind IN(
 'message','offer','offer_accepted','offer_declined','offer_withdrawn','admin_listing_pending',
 'listing_approved','listing_rejected','admin_report','admin_verification','verification_approved',
 'verification_rejected','listing_sold','listing_relisted','price_drop','seller_new_ad','admin_chat_report',
 'verification_changes_requested','verification_suspended','admin_verification_escalation'));

CREATE OR REPLACE FUNCTION public.marketly_notify_admin_new_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF TG_TABLE_NAME='listing_reports' THEN
  INSERT INTO public.notifications(recipient_id,actor_id,listing_id,report_id,kind,title,event_key)
  SELECT a.user_id,NEW.reporter_id,NEW.listing_id,NEW.id,'admin_report','A listing has been reported',
  'listing_report:'||NEW.id FROM public.marketly_admins a WHERE a.is_active
  AND (a.role='owner' OR EXISTS(SELECT 1 FROM public.marketly_admin_permissions ap
   WHERE ap.user_id=a.user_id AND ap.permission='reports'))
  ON CONFLICT(recipient_id,event_key) WHERE event_key IS NOT NULL DO NOTHING;
 ELSIF TG_TABLE_NAME='seller_verification_requests' THEN
  INSERT INTO public.notifications(recipient_id,actor_id,verification_request_id,kind,title,event_key)
  SELECT a.user_id,NEW.seller_id,NEW.id,'admin_verification','New seller verification request',
   'verify:'||NEW.id||':'||NEW.revision FROM public.marketly_admins a WHERE a.is_active
  AND (a.role='owner' OR EXISTS(SELECT 1 FROM public.marketly_admin_permissions ap
  WHERE ap.user_id=a.user_id AND ap.permission='verification'))
  ON CONFLICT(recipient_id,event_key) WHERE event_key IS NOT NULL DO NOTHING;
 END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.marketly_notify_admin_chat_report()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 INSERT INTO public.notifications(recipient_id,actor_id,chat_report_id,kind,title,event_key)
 SELECT a.user_id,NEW.reporter_id,NEW.id,'admin_chat_report',
 left('New chat report awaiting review ('||NEW.reason||')',140),'chat_report:'||NEW.id
 FROM public.marketly_admins a WHERE a.is_active AND (a.role='owner' OR EXISTS(
 SELECT 1 FROM public.marketly_admin_permissions ap WHERE ap.user_id=a.user_id AND ap.permission='chat_reports'))
 ON CONFLICT(recipient_id,event_key) WHERE event_key IS NOT NULL DO NOTHING;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.marketly_notify_verification_decision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_kind text;v_title text;
BEGIN
 IF NEW.status=OLD.status THEN RETURN NEW; END IF;
 IF NEW.status='pending' AND OLD.status='changes_requested' THEN
  INSERT INTO public.notifications(recipient_id,actor_id,verification_request_id,kind,title,event_key)
  SELECT a.user_id,NEW.seller_id,NEW.id,'admin_verification','Seller resubmitted verification evidence',
  'verify:'||NEW.id||':'||NEW.revision FROM public.marketly_admins a WHERE a.is_active
  AND (a.role='owner' OR EXISTS(SELECT 1 FROM public.marketly_admin_permissions ap
  WHERE ap.user_id=a.user_id AND ap.permission='verification'))
  ON CONFLICT(recipient_id,event_key) WHERE event_key IS NOT NULL DO NOTHING;
 ELSIF NEW.status IN ('approved','rejected','changes_requested','suspended') THEN
  v_kind:=CASE NEW.status WHEN 'approved' THEN 'verification_approved'
     WHEN 'rejected' THEN 'verification_rejected'
     WHEN 'changes_requested' THEN 'verification_changes_requested' ELSE 'verification_suspended' END;
  v_title:=CASE NEW.status WHEN 'approved' THEN 'Your seller verification was approved'
     WHEN 'rejected' THEN 'Your verification request was rejected'
     WHEN 'changes_requested' THEN 'Please update your identity photos or details'
     ELSE 'Your seller verification has been suspended' END;
  INSERT INTO public.notifications(recipient_id,actor_id,verification_request_id,kind,title,event_key)
  VALUES(NEW.seller_id,auth.uid(),NEW.id,v_kind,v_title,
  'verify_status:'||NEW.id||':'||NEW.revision||':'||NEW.status)
  ON CONFLICT(recipient_id,event_key) WHERE event_key IS NOT NULL DO NOTHING;
 END IF;
 RETURN NEW;
END $$;

-- Existing Phase08A wrappers are replaced to require uploaded evidence for approval.
CREATE OR REPLACE FUNCTION public.marketly_review_verification(p_request_id uuid,p_decision text,p_note text DEFAULT '')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v record;
BEGIN
 IF NOT public.marketly_admin_has_permission('verification') THEN RAISE EXCEPTION 'ADMIN_PERMISSION_REQUIRED'; END IF;
 IF p_decision NOT IN ('approved','rejected','changes_requested') OR char_length(coalesce(p_note,''))>500
  THEN RAISE EXCEPTION 'INVALID_REVIEW_DECISION'; END IF;
 SELECT id,seller_id,status,escalated_at INTO v FROM public.seller_verification_requests
  WHERE id=p_request_id FOR UPDATE;
 IF NOT FOUND OR v.status<>'pending' THEN RAISE EXCEPTION 'PENDING_REQUEST_REQUIRED'; END IF;
 IF v.seller_id=auth.uid() THEN RAISE EXCEPTION 'SELF_REVIEW_NOT_ALLOWED'; END IF;
 IF v.escalated_at IS NOT NULL AND NOT public.marketly_is_owner()
  THEN RAISE EXCEPTION 'ESCALATED_OWNER_REVIEW_ONLY'; END IF;
 IF p_decision='approved' AND NOT EXISTS(SELECT 1 FROM public.marketly_identity_submissions i
   WHERE i.request_id=p_request_id AND i.documents_purged_at IS NULL
   AND i.front_path IS NOT NULL AND i.back_path IS NOT NULL AND i.selfie_path IS NOT NULL)
  THEN RAISE EXCEPTION 'SECURE_IDENTITY_EVIDENCE_REQUIRED'; END IF;
 IF p_decision IN ('rejected','changes_requested') AND char_length(btrim(coalesce(p_note,'')))<8
  THEN RAISE EXCEPTION 'REVIEW_REASON_REQUIRED'; END IF;
 IF p_decision='changes_requested' THEN
  UPDATE public.seller_verification_requests SET status='changes_requested',admin_note=btrim(p_note),reviewed_at=now()
   WHERE id=p_request_id;
  INSERT INTO public.marketly_admin_log(admin_id,action,target_id,note)
   VALUES(auth.uid(),'verification_changes_requested',p_request_id,btrim(p_note));
 ELSE
  -- Keep existing approval/rejection side effects and audit from original implementation.
  PERFORM public.marketly_review_verification_before_roles(p_request_id,p_decision,p_note);
  UPDATE public.marketly_identity_submissions SET purge_after=now()+interval '90 days'
   WHERE request_id=p_request_id;
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.marketly_review_verification(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.marketly_review_verification(uuid,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.marketly_escalate_verification(p_request_id uuid,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v record;v_owner uuid;
BEGIN
 IF NOT public.marketly_admin_has_permission('verification') THEN RAISE EXCEPTION 'ADMIN_PERMISSION_REQUIRED'; END IF;
 IF char_length(btrim(coalesce(p_reason,'')))<8 THEN RAISE EXCEPTION 'ESCALATION_REASON_REQUIRED'; END IF;
 SELECT seller_id,status,escalated_at INTO v FROM public.seller_verification_requests WHERE id=p_request_id FOR UPDATE;
 IF NOT FOUND OR v.status<>'pending' OR v.seller_id=auth.uid() THEN RAISE EXCEPTION 'REVIEW_NOT_ALLOWED'; END IF;
 IF v.escalated_at IS NOT NULL THEN RETURN; END IF;
 UPDATE public.seller_verification_requests SET escalated_at=now(),escalated_note=left(p_reason,500) WHERE id=p_request_id;
 SELECT user_id INTO v_owner FROM public.marketly_admins WHERE role='owner' AND is_active LIMIT 1;
 IF v_owner IS NOT NULL AND v_owner<>auth.uid() THEN
 INSERT INTO public.notifications(recipient_id,actor_id,verification_request_id,kind,title,event_key)
 VALUES(v_owner,auth.uid(),p_request_id,'admin_verification_escalation','Seller verification escalated for Owner review',
 'verify_escalated:'||p_request_id)
 ON CONFLICT(recipient_id,event_key) WHERE event_key IS NOT NULL DO NOTHING;
 END IF;
 INSERT INTO public.marketly_admin_log(admin_id,action,target_id,note)
 VALUES(auth.uid(),'verification_escalated',p_request_id,left(p_reason,500));
END $$;
REVOKE ALL ON FUNCTION public.marketly_escalate_verification(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.marketly_escalate_verification(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.marketly_owner_revoke_verification(p_request_id uuid,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_seller uuid;
BEGIN
 IF NOT public.marketly_is_owner() THEN RAISE EXCEPTION 'OWNER_ONLY'; END IF;
 IF char_length(btrim(coalesce(p_reason,'')))<8 THEN RAISE EXCEPTION 'REVOKE_REASON_REQUIRED'; END IF;
 SELECT seller_id INTO v_seller FROM public.seller_verification_requests
 WHERE id=p_request_id AND status='approved' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'APPROVED_REQUEST_REQUIRED'; END IF;
 UPDATE public.seller_verification_requests SET status='suspended',admin_note=left(p_reason,500),reviewed_at=now()
  WHERE id=p_request_id;
 UPDATE public.profiles SET identity_verified=false WHERE id=v_seller;
 INSERT INTO public.marketly_admin_log(admin_id,action,target_id,note)
 VALUES(auth.uid(),'verification_revoked',p_request_id,left(p_reason,500));
END $$;
REVOKE ALL ON FUNCTION public.marketly_owner_revoke_verification(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.marketly_owner_revoke_verification(uuid,text) TO authenticated;

-- Owner-only candidate list, designed for an audited external cleanup job.
-- Actual Storage deletion MUST be performed by an explicitly authorized server job.
CREATE OR REPLACE FUNCTION public.marketly_identity_retention_candidates()
RETURNS TABLE(request_id uuid,front_path text,back_path text,selfie_path text,purge_after timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT public.marketly_is_owner() THEN RAISE EXCEPTION 'OWNER_ONLY'; END IF;
 RETURN QUERY SELECT i.request_id,i.front_path,i.back_path,i.selfie_path,i.purge_after
 FROM public.marketly_identity_submissions i
 WHERE i.purge_after<=now() AND i.documents_purged_at IS NULL ORDER BY i.purge_after;
END $$;
REVOKE ALL ON FUNCTION public.marketly_identity_retention_candidates() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.marketly_identity_retention_candidates() TO authenticated;

COMMIT;
