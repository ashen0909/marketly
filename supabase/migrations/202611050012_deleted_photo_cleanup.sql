-- Phase 07.1C: retain deleted ad photos for 30 days, then allow carefully audited
-- manual cleanup. No cron, no auto-delete, no change to sold ads or chat history.
BEGIN;
CREATE TABLE IF NOT EXISTS public.marketly_deleted_image_cleanup (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
 storage_path text NOT NULL,
 preview_storage_path text,
 deleted_at timestamptz NOT NULL,
 cleaned_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(listing_id,storage_path)
);
CREATE INDEX IF NOT EXISTS marketly_cleanup_queue_idx ON public.marketly_deleted_image_cleanup(deleted_at) WHERE cleaned_at IS NULL;
ALTER TABLE public.marketly_deleted_image_cleanup ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.marketly_deleted_image_cleanup FROM PUBLIC,anon,authenticated;
-- All queue operations reserved for service role and database triggers.
GRANT SELECT,UPDATE,INSERT,DELETE ON public.marketly_deleted_image_cleanup TO service_role;

CREATE OR REPLACE FUNCTION public.marketly_enqueue_deleted_images()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.status='deleted' AND OLD.status IS DISTINCT FROM 'deleted' THEN
  INSERT INTO public.marketly_deleted_image_cleanup(listing_id,storage_path,preview_storage_path,deleted_at)
    SELECT NEW.id,i.storage_path,i.preview_storage_path,coalesce(NEW.deleted_at,now())
    FROM public.listing_images i WHERE i.listing_id=NEW.id
    ON CONFLICT(listing_id,storage_path) DO NOTHING;
 END IF;
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS marketly_queue_deleted_images ON public.listings;
CREATE TRIGGER marketly_queue_deleted_images AFTER UPDATE OF status ON public.listings
 FOR EACH ROW WHEN (NEW.status='deleted') EXECUTE FUNCTION public.marketly_enqueue_deleted_images();
-- Backfill existing deleted ads (including ads deleted before SQL 012).
INSERT INTO public.marketly_deleted_image_cleanup(listing_id,storage_path,preview_storage_path,deleted_at)
 SELECT l.id,i.storage_path,i.preview_storage_path,coalesce(l.deleted_at,l.published_at)
 FROM public.listings l JOIN public.listing_images i ON i.listing_id=l.id WHERE l.status='deleted'
 ON CONFLICT(listing_id,storage_path) DO NOTHING;

CREATE OR REPLACE FUNCTION public.marketly_refuse_deleted_photo_edit()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE v_listing uuid;
BEGIN
 v_listing:=CASE WHEN TG_OP='DELETE' THEN OLD.listing_id ELSE NEW.listing_id END;
 IF EXISTS(SELECT 1 FROM public.listings WHERE id=v_listing AND status='deleted') THEN
   -- Private service-role cleanup function only. Table write privileges remain revoked.
   IF NOT (TG_OP='DELETE' AND current_setting('marketly.authorized_cleanup',true)='on') THEN
     RAISE EXCEPTION 'DELETED_AD_PHOTOS_CANNOT_BE_EDITED';
   END IF;
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE OR REPLACE FUNCTION public.marketly_finalize_deleted_image_cleanup(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_job public.marketly_deleted_image_cleanup%ROWTYPE;
BEGIN
 IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'SERVICE_ROLE_ONLY'; END IF;
 SELECT * INTO v_job FROM public.marketly_deleted_image_cleanup WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'JOB_NOT_FOUND'; END IF;
 IF v_job.cleaned_at IS NOT NULL THEN RETURN; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.listings WHERE id=v_job.listing_id AND status='deleted'
    AND deleted_at <= now()-interval '30 days') THEN RAISE EXCEPTION 'DELETED_RETENTION_NOT_MET'; END IF;
 PERFORM set_config('marketly.authorized_cleanup','on',true);
 DELETE FROM public.listing_images WHERE listing_id=v_job.listing_id AND storage_path=v_job.storage_path;
 PERFORM set_config('marketly.authorized_cleanup','off',true);
 UPDATE public.marketly_deleted_image_cleanup SET cleaned_at=now() WHERE id=p_id;
END;
$$;
REVOKE ALL ON FUNCTION public.marketly_finalize_deleted_image_cleanup(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.marketly_finalize_deleted_image_cleanup(uuid) TO service_role;
COMMIT;
