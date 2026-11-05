-- Marketly Phase 06 polish: automatic read notices, admin chat-report alerts, remove 60-day expiry.
-- Apply ONCE after SQL 007. Safe for existing ads/messages and all billing data.
BEGIN;

-- Phase 06C shopping expiry/renewal was rejected. Preserve historical ledger for audit;
-- cease consuming extra free ad credits and keep existing listings available.
ALTER TABLE public.listings ALTER COLUMN expires_at SET DEFAULT '9999-12-31 00:00:00+00'::timestamptz;
UPDATE public.listings
 SET expires_at='9999-12-31 00:00:00+00'::timestamptz,
     renewal_pending=false
 WHERE expires_at IS DISTINCT FROM '9999-12-31 00:00:00+00'::timestamptz
    OR renewal_pending=true;

-- Keep SQL 007 authorization and chat-lock rules intact. Their expiry checks remain
-- true for 9999-dated listings. This disables time-based expiry without dropping data.
CREATE OR REPLACE FUNCTION public.marketly_set_listing_expiry_on_approval()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.status='active' AND NEW.moderation_status='approved' THEN
   NEW.expires_at:='9999-12-31 00:00:00+00'::timestamptz;
   NEW.renewal_pending:=false;
   IF OLD.chat_reopen_notice_pending THEN
     NEW.chat_reopen_notice_pending:=false;
   END IF;
 END IF;
 RETURN NEW;
END$$;

-- SQL 004 publish RPC already checks monthly posting quota with a transaction lock.
-- Disable the SQL 007 renewal-ledger surcharge; do not delete historic ledger rows.
DROP TRIGGER IF EXISTS marketly_combined_posting_quota ON public.listing_post_ledger;

-- SQL 007 has chat reporting, but no alert trigger. Allow this admin-only event kind.
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_kind_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_kind_check CHECK (
 kind IN ('message','offer','offer_accepted','offer_declined','offer_withdrawn',
 'admin_listing_pending','listing_approved','listing_rejected','admin_report',
 'admin_verification','verification_approved','verification_rejected',
 'listing_sold','listing_relisted','price_drop','seller_new_ad','admin_chat_report')
);

-- Notification is generated only by a new valid chat-report row. The existing
-- marketly_report_chat RPC handles participant authorization and rate limiting.
CREATE OR REPLACE FUNCTION public.marketly_notify_admin_chat_report()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 INSERT INTO public.notifications(recipient_id,actor_id,kind,title)
 SELECT a.user_id,NEW.reporter_id,'admin_chat_report',
   left('New chat report awaiting review ('||NEW.reason||')',140)
 FROM public.marketly_admins a
 JOIN public.profiles p ON p.id=a.user_id;
 RETURN NEW;
END$$;
REVOKE ALL ON FUNCTION public.marketly_notify_admin_chat_report() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS marketly_admin_chat_report_notice ON public.marketly_chat_reports;
CREATE TRIGGER marketly_admin_chat_report_notice
 AFTER INSERT ON public.marketly_chat_reports
 FOR EACH ROW EXECUTE FUNCTION public.marketly_notify_admin_chat_report();

COMMIT;
