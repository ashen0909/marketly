-- Marketly Phase 07.1A-E: private profile details & gated identity verification.
-- Run AFTER SQL 010. No destructive changes to listings, chats, or credit ledgers.
BEGIN;

CREATE TABLE IF NOT EXISTS public.marketly_profile_details (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  district text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  about text NOT NULL DEFAULT '',
  contact_preference text NOT NULL DEFAULT '',
  photo_path text,
  email_notifications boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketly_profile_name_len CHECK (char_length(full_name)<=100),
  CONSTRAINT marketly_profile_city_len CHECK (char_length(city)<=80),
  CONSTRAINT marketly_profile_about_len CHECK (char_length(about)<=500),
  CONSTRAINT marketly_profile_phone_len CHECK (char_length(phone)<=20),
  CONSTRAINT marketly_profile_pref CHECK (contact_preference IN ('','chat','phone','whatsapp'))
);
ALTER TABLE public.marketly_profile_details ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.marketly_profile_details FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.marketly_profile_details TO authenticated;
DROP POLICY IF EXISTS marketly_profile_details_self_read ON public.marketly_profile_details;
CREATE POLICY marketly_profile_details_self_read ON public.marketly_profile_details
  FOR SELECT TO authenticated USING (user_id=(SELECT auth.uid()));
-- No table write permissions for clients. All edits go through constrained RPCs.

-- Private bucket: avatars are never public or identity documents.
INSERT INTO storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
VALUES ('marketly-profile-photos','marketly-profile-photos',false,2097152,ARRAY['image/webp'])
ON CONFLICT (id) DO UPDATE SET public=false,file_size_limit=2097152,
  allowed_mime_types=ARRAY['image/webp'];

CREATE OR REPLACE FUNCTION public.marketly_update_my_profile(
  p_display_name text,p_full_name text,p_phone text,p_district text,
  p_city text,p_about text,p_contact_preference text,p_email_notifications boolean
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  v_uid uuid:=auth.uid();
  v_full text:=btrim(coalesce(p_full_name,''));
  v_phone text:=btrim(coalesce(p_phone,''));
  v_district text:=btrim(coalesce(p_district,''));
  v_city text:=btrim(coalesce(p_city,''));
  v_about text:=btrim(coalesce(p_about,''));
  v_display text:=btrim(coalesce(p_display_name,''));
  v_previous_full text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF char_length(v_display) NOT BETWEEN 2 AND 60 OR char_length(v_full)>100
    OR char_length(v_phone)>20 OR char_length(v_city)>80 OR char_length(v_about)>500
    OR p_contact_preference NOT IN ('','chat','phone','whatsapp') OR p_contact_preference IS NULL
    OR (v_phone<>'' AND v_phone !~ '^\+947[0-9]{8}$')
    OR (v_district<>'' AND v_district NOT IN (
      'Colombo','Gampaha','Kalutara','Kandy','Matale','Nuwara Eliya','Galle',
      'Matara','Hambantota','Jaffna','Kilinochchi','Mannar','Mullaitivu',
      'Vavuniya','Trincomalee','Batticaloa','Ampara','Kurunegala','Puttalam',
      'Anuradhapura','Polonnaruwa','Badulla','Monaragala','Ratnapura','Kegalle'))
    THEN RAISE EXCEPTION 'INVALID_PROFILE_DETAILS'; END IF;
  SELECT full_name INTO v_previous_full FROM public.marketly_profile_details WHERE user_id=v_uid FOR UPDATE;
  INSERT INTO public.marketly_profile_details
    (user_id,full_name,phone,district,city,about,contact_preference,email_notifications,updated_at)
  VALUES (v_uid,v_full,v_phone,v_district,v_city,v_about,p_contact_preference,coalesce(p_email_notifications,true),now())
  ON CONFLICT (user_id) DO UPDATE SET
    full_name=EXCLUDED.full_name,phone=EXCLUDED.phone,district=EXCLUDED.district,
    city=EXCLUDED.city,about=EXCLUDED.about,contact_preference=EXCLUDED.contact_preference,
    email_notifications=EXCLUDED.email_notifications,updated_at=now();
  -- Identity-sensitive name changes revoke previous approval; display name edits do not.
  IF v_previous_full IS NOT NULL AND v_previous_full IS DISTINCT FROM v_full THEN
    UPDATE public.profiles SET identity_verified=false WHERE id=v_uid AND identity_verified=true;
  END IF;
  UPDATE public.profiles SET display_name=v_display WHERE id=v_uid;
END;
$$;
REVOKE ALL ON FUNCTION public.marketly_update_my_profile(text,text,text,text,text,text,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.marketly_update_my_profile(text,text,text,text,text,text,text,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.marketly_set_profile_photo(p_photo_path text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,storage,pg_temp AS $$
DECLARE v_uid uuid:=auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF p_photo_path IS NOT NULL THEN
    IF char_length(p_photo_path)>250 OR split_part(p_photo_path,'/',1)<>v_uid::text
      OR p_photo_path NOT LIKE '%.webp'
      OR NOT EXISTS(SELECT 1 FROM storage.objects
        WHERE bucket_id='marketly-profile-photos' AND name=p_photo_path)
      THEN RAISE EXCEPTION 'INVALID_PROFILE_PHOTO'; END IF;
  END IF;
  INSERT INTO public.marketly_profile_details(user_id,photo_path,updated_at)
  VALUES(v_uid,p_photo_path,now())
  ON CONFLICT(user_id) DO UPDATE SET photo_path=excluded.photo_path,updated_at=now();
END;
$$;
REVOKE ALL ON FUNCTION public.marketly_set_profile_photo(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.marketly_set_profile_photo(text) TO authenticated;

-- Exact countable criteria used by both the UI and the verification backend:
-- public name, legal name, phone, district, city, about, contact preference, profile photo.
CREATE OR REPLACE FUNCTION public.marketly_profile_is_complete(p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.marketly_profile_details d ON d.user_id=p.id
    WHERE p.id=p_user
      AND char_length(btrim(p.display_name))>=2
      AND char_length(btrim(d.full_name))>=3
      AND d.phone ~ '^\+947[0-9]{8}$'
      AND d.district<>'' AND char_length(btrim(d.city))>=2
      AND char_length(btrim(d.about))>=10
      AND d.contact_preference IN ('chat','phone','whatsapp')
      AND d.photo_path IS NOT NULL
  );
$$;
REVOKE ALL ON FUNCTION public.marketly_profile_is_complete(uuid) FROM PUBLIC,anon,authenticated;
-- Called internally by SECURITY DEFINER request function only.

CREATE OR REPLACE FUNCTION public.marketly_request_verification(p_kind text,p_details text DEFAULT '')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_id uuid;v_uid uuid:=auth.uid();
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
 IF p_kind NOT IN('identity','business') OR char_length(coalesce(p_details,''))>400 THEN RAISE EXCEPTION 'INVALID_REQUEST'; END IF;
 IF NOT public.marketly_profile_is_complete(v_uid) THEN RAISE EXCEPTION 'PROFILE_COMPLETION_REQUIRED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=v_uid AND u.email_confirmed_at IS NOT NULL)
   THEN RAISE EXCEPTION 'VERIFIED_EMAIL_REQUIRED'; END IF;
 IF EXISTS(SELECT 1 FROM public.seller_verification_requests
           WHERE seller_id=v_uid AND kind=p_kind AND status='pending') THEN RAISE EXCEPTION 'REQUEST_ALREADY_PENDING'; END IF;
 INSERT INTO public.seller_verification_requests(seller_id,kind,details)
 VALUES(v_uid,p_kind,coalesce(btrim(p_details),'')) RETURNING id INTO v_id;
 RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.marketly_request_verification(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.marketly_request_verification(text,text) TO authenticated;

COMMIT;
