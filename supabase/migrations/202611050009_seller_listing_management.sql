-- Marketly Phase 07: Draft ads, owner-only photo organization, safe resubmission.
-- Run ONCE AFTER SQL 008. Does NOT activate real paid features or ad expiry.
BEGIN;

CREATE TABLE IF NOT EXISTS public.marketly_listing_drafts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 seller_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 title text NOT NULL DEFAULT '',
 description text NOT NULL DEFAULT '',
 price_lkr bigint,
 category text,
 location text,
 condition text,
 is_negotiable boolean NOT NULL DEFAULT false,
 image_paths text[] NOT NULL DEFAULT ARRAY[]::text[],
 preview_paths text[] NOT NULL DEFAULT ARRAY[]::text[],
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT marketly_draft_title_max CHECK(length(title)<=90),
 CONSTRAINT marketly_draft_desc_max CHECK(length(description)<=2500),
 CONSTRAINT marketly_draft_price_valid CHECK(price_lkr IS NULL OR price_lkr BETWEEN 1 AND 999999999),
 CONSTRAINT marketly_draft_image_count CHECK(cardinality(image_paths)<=5 AND cardinality(image_paths)=cardinality(preview_paths))
);
CREATE INDEX IF NOT EXISTS marketly_listing_drafts_seller_recent ON public.marketly_listing_drafts(seller_id,updated_at DESC);
ALTER TABLE public.marketly_listing_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.marketly_listing_drafts FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.marketly_listing_drafts TO authenticated;
DROP POLICY IF EXISTS "Seller reads own saved drafts" ON public.marketly_listing_drafts;
CREATE POLICY "Seller reads own saved drafts" ON public.marketly_listing_drafts
 FOR SELECT TO authenticated USING(seller_id=(SELECT auth.uid()));

-- Draft save is intentionally permissive for incomplete text but strict for image ownership.
-- All writes use an authenticated SECURITY DEFINER function, never client table writes.
CREATE OR REPLACE FUNCTION public.marketly_save_listing_draft(
 p_draft_id uuid,p_title text,p_description text,p_price_lkr bigint,
 p_category text,p_location text,p_condition text,p_is_negotiable boolean,
 p_image_paths text[],p_preview_paths text[]
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,storage,pg_temp AS $$
DECLARE v_owner uuid:=auth.uid(); v_id uuid; v_count int; v_i int;
BEGIN
 IF v_owner IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=v_owner) THEN RAISE EXCEPTION 'LOGIN_REQUIRED'; END IF;
 IF length(coalesce(p_title,''))>90 OR length(coalesce(p_description,''))>2500
 OR (p_price_lkr IS NOT NULL AND p_price_lkr NOT BETWEEN 1 AND 999999999)
 OR (p_category IS NOT NULL AND p_category NOT IN('Mobiles','Vehicles','Property','Electronics','Home & Living','Fashion','Services','Other'))
 OR (p_location IS NOT NULL AND p_location NOT IN('Colombo','Gampaha','Kalutara','Kandy','Matale','Nuwara Eliya','Galle','Matara','Hambantota','Jaffna','Kilinochchi','Mannar','Mullaitivu','Vavuniya','Trincomalee','Batticaloa','Ampara','Kurunegala','Puttalam','Anuradhapura','Polonnaruwa','Badulla','Monaragala','Ratnapura','Kegalle'))
 OR (p_condition IS NOT NULL AND p_condition NOT IN('New','Used','Refurbished'))
 OR p_is_negotiable IS NULL THEN RAISE EXCEPTION 'INVALID_DRAFT_FIELDS'; END IF;
 v_count:=coalesce(cardinality(p_image_paths),0);
 IF v_count>5 OR coalesce(cardinality(p_preview_paths),0)<>v_count THEN RAISE EXCEPTION 'MAX_FIVE_FREE_PHOTOS'; END IF;
 IF (SELECT count(DISTINCT u.path) FROM unnest(coalesce(p_image_paths,ARRAY[]::text[])) AS u(path))<>v_count
 OR (SELECT count(DISTINCT u.path) FROM unnest(coalesce(p_preview_paths,ARRAY[]::text[])) AS u(path))<>v_count THEN RAISE EXCEPTION 'DUPLICATE_DRAFT_PHOTO'; END IF;
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
REVOKE ALL ON FUNCTION public.marketly_save_listing_draft(uuid,text,text,bigint,text,text,text,boolean,text[],text[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.marketly_save_listing_draft(uuid,text,text,bigint,text,text,text,boolean,text[],text[]) TO authenticated;

-- Publish through the already audited SQL 004 publishing RPC. It performs the
-- atomic free quota transaction, validates images and notifies admins via triggers.
-- Draft deletion is in the SAME transaction: failed publish leaves draft untouched.
CREATE OR REPLACE FUNCTION public.marketly_submit_listing_draft(p_draft_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,storage,pg_temp AS $$
DECLARE v_owner uuid:=auth.uid(); v_draft public.marketly_listing_drafts%ROWTYPE; v_listing uuid;
BEGIN
 IF v_owner IS NULL THEN RAISE EXCEPTION 'LOGIN_REQUIRED'; END IF;
 SELECT * INTO v_draft FROM public.marketly_listing_drafts
 WHERE id=p_draft_id AND seller_id=v_owner FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'DRAFT_NOT_FOUND_OR_NOT_YOURS'; END IF;
 -- Do not allow duplicate active/pending ads from the same seller.
 IF EXISTS(SELECT 1 FROM public.listings WHERE seller_id=v_owner AND status<>'deleted'
   AND lower(btrim(title))=lower(btrim(v_draft.title))) THEN RAISE EXCEPTION 'DUPLICATE_ACTIVE_AD_TITLE'; END IF;
 v_listing:=public.marketly_publish_listing(
  v_draft.title,v_draft.description,v_draft.price_lkr,v_draft.category,v_draft.location,
  v_draft.condition,v_draft.is_negotiable,v_draft.image_paths,v_draft.preview_paths);
 DELETE FROM public.marketly_listing_drafts WHERE id=v_draft.id;
 RETURN v_listing;
END$$;
REVOKE ALL ON FUNCTION public.marketly_submit_listing_draft(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.marketly_submit_listing_draft(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.marketly_delete_listing_draft(p_draft_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'LOGIN_REQUIRED'; END IF;
 DELETE FROM public.marketly_listing_drafts WHERE id=p_draft_id AND seller_id=auth.uid();
 IF NOT FOUND THEN RAISE EXCEPTION 'DRAFT_NOT_FOUND_OR_NOT_YOURS'; END IF;
END$$;
REVOKE ALL ON FUNCTION public.marketly_delete_listing_draft(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.marketly_delete_listing_draft(uuid) TO authenticated;

-- Reorder, set cover photo (first image), and remove individual photos for own
-- existing ads. Any photo removal requires re-review; pure reordering does not.
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
 IF v_count<1 OR v_count>5 OR v_count>v_old_count OR
  (SELECT count(DISTINCT u.path) FROM unnest(coalesce(p_ordered_paths,ARRAY[]::text[])) AS u(path))<>v_count
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
REVOKE ALL ON FUNCTION public.marketly_manage_listing_photos(uuid,text[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.marketly_manage_listing_photos(uuid,text[]) TO authenticated;
COMMIT;
