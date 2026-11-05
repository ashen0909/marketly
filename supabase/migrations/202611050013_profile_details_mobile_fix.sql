-- Marketly Phase 07.1 profile/mobile fixes (SQL 013).
-- Run AFTER SQL 011 and SQL 012. Safe CREATE OR REPLACE of the existing RPC.
-- Accept both Sri Lankan local 07xxxxxxxx and +947xxxxxxxx input; store +94 consistently.
-- No data deletion, no changes to verification approval, posting credits or chats.
BEGIN;

CREATE OR REPLACE FUNCTION public.marketly_update_my_profile(
  p_display_name text, p_full_name text, p_phone text, p_district text,
  p_city text, p_about text, p_contact_preference text, p_email_notifications boolean
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_full text := btrim(coalesce(p_full_name, ''));
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[[:space:]().-]', '', 'g');
  v_district text := btrim(coalesce(p_district, ''));
  v_city text := btrim(coalesce(p_city, ''));
  v_about text := btrim(coalesce(p_about, ''));
  v_display text := btrim(coalesce(p_display_name, ''));
  v_previous_full text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;

  IF v_phone ~ '^07[0-9]{8}$' THEN
    v_phone := '+94' || substring(v_phone from 2);
  ELSIF v_phone ~ '^947[0-9]{8}$' THEN
    v_phone := '+' || v_phone;
  ELSIF v_phone ~ '^7[0-9]{8}$' THEN
    v_phone := '+94' || v_phone;
  END IF;

  -- Fields are optional while completing a profile over time. Entered fields
  -- must be syntactically valid. Completion/identity review is enforced separately.
  IF char_length(v_display) NOT BETWEEN 2 AND 60
     OR char_length(v_full)>100
     OR (v_full <> '' AND char_length(v_full)<3)
     OR char_length(v_city)>80
     OR (v_city<>'' AND char_length(v_city)<2)
     OR char_length(v_about)>500
     OR (v_about<>'' AND char_length(v_about)<10)
     OR char_length(v_phone)>20
     OR (v_phone<>'' AND v_phone !~ '^\+947[0-9]{8}$')
     OR p_contact_preference IS NULL
     OR p_contact_preference NOT IN ('','chat','phone','whatsapp')
     OR (v_city<>'' AND v_district='')
     OR (v_district<>'' AND v_district NOT IN (
       'Colombo','Gampaha','Kalutara','Kandy','Matale','Nuwara Eliya','Galle',
       'Matara','Hambantota','Jaffna','Kilinochchi','Mannar','Mullaitivu',
       'Vavuniya','Trincomalee','Batticaloa','Ampara','Kurunegala','Puttalam',
       'Anuradhapura','Polonnaruwa','Badulla','Monaragala','Ratnapura','Kegalle'
     ))
  THEN
    RAISE EXCEPTION 'INVALID_PROFILE_DETAILS';
  END IF;

  SELECT full_name INTO v_previous_full
  FROM public.marketly_profile_details
  WHERE user_id=v_uid FOR UPDATE;

  INSERT INTO public.marketly_profile_details (
    user_id,full_name,phone,district,city,about,contact_preference,email_notifications,updated_at
  ) VALUES (
    v_uid,v_full,v_phone,v_district,v_city,v_about,p_contact_preference,
    coalesce(p_email_notifications,true),now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    full_name=EXCLUDED.full_name,
    phone=EXCLUDED.phone,
    district=EXCLUDED.district,
    city=EXCLUDED.city,
    about=EXCLUDED.about,
    contact_preference=EXCLUDED.contact_preference,
    email_notifications=EXCLUDED.email_notifications,
    updated_at=now();

  -- Changing an already verified legal name requires renewed identity review.
  IF v_previous_full IS NOT NULL AND v_previous_full IS DISTINCT FROM v_full THEN
    UPDATE public.profiles SET identity_verified=false
    WHERE id=v_uid AND identity_verified=true;
  END IF;

  UPDATE public.profiles SET display_name=v_display WHERE id=v_uid;
END;
$$;

REVOKE ALL ON FUNCTION public.marketly_update_my_profile(text,text,text,text,text,text,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.marketly_update_my_profile(text,text,text,text,text,text,text,boolean) TO authenticated;

COMMIT;
