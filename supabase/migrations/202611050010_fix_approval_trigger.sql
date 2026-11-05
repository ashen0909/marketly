-- Marketly Phase 07 hotfix: admin approval of corrected/rejected listings.
-- SQL 008's trigger function refers to OLD.chat_reopen_notice_pending, but this
-- column does not exist on public.listings. The chat lock depends on the live
-- listing status and moderation_status (SQL 007), not a pending-notice column.
-- Execute ONCE after SQL 009. No table changes or data deletion.
BEGIN;
CREATE OR REPLACE FUNCTION public.marketly_set_listing_expiry_on_approval()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  IF NEW.status='active' AND NEW.moderation_status='approved' THEN
    NEW.expires_at:='9999-12-31 00:00:00+00'::timestamptz;
    NEW.renewal_pending:=false;
  END IF;
  RETURN NEW;
END$$;
COMMIT;
