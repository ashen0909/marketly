-- Phase 08B.1: atomic duplicate-NIC protection at the database boundary.
-- Run only after phase 08B migration 202611050015; back up before applying.
BEGIN;
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
 PERFORM pg_advisory_xact_lock(hashtextextended(p_nic_fingerprint,7190));
 -- Prevent two different seller accounts from claiming the same NIC fingerprint.
 -- Same seller may resubmit after changes requested. Do not reveal the matched account.
 IF EXISTS (SELECT 1 FROM public.marketly_identity_submissions i
            WHERE i.nic_fingerprint=p_nic_fingerprint AND i.seller_id<>v_uid)
 THEN RAISE EXCEPTION 'NIC_ALREADY_LINKED_TO_ANOTHER_SELLER'; END IF;
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
COMMIT;
