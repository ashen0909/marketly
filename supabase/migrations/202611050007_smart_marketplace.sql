-- Marketly Phase 06 (Smart Marketplace Experience)
-- Apply ONCE, after migration 006. Keep 05B sandbox billing separate.
-- Critical: authorization for chat locks is enforced in Postgres, not just disabled buttons.
BEGIN;

-- 60-day public listing lifetime; existing listings get a fair 60 days from migration.
-- Newly submitted ads start their countdown only after first admin approval.
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS renewal_pending boolean NOT NULL DEFAULT false;
UPDATE public.listings SET expires_at=now()+interval '60 days' WHERE expires_at IS NULL AND moderation_status='approved';
CREATE INDEX IF NOT EXISTS marketly_public_expiry_idx ON public.listings(expires_at,published_at DESC)
 WHERE status='active' AND moderation_status='approved';

CREATE OR REPLACE FUNCTION public.marketly_set_listing_expiry_on_approval()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.status='active' AND NEW.moderation_status='approved'
   AND OLD.moderation_status IS DISTINCT FROM 'approved'
   AND (OLD.expires_at IS NULL OR OLD.renewal_pending) THEN
   NEW.expires_at:=now()+interval '60 days';
   NEW.renewal_pending:=false;
 END IF;
 RETURN NEW;
END$$;
DROP TRIGGER IF EXISTS marketly_listing_approval_expiry ON public.listings;
CREATE TRIGGER marketly_listing_approval_expiry BEFORE UPDATE OF moderation_status ON public.listings
 FOR EACH ROW EXECUTE FUNCTION public.marketly_set_listing_expiry_on_approval();

-- Renewing an expired listing uses one free posting slot in the current Sri Lankan calendar month.
-- Existing relist of a sold/paused but unexpired listing remains free.
CREATE TABLE IF NOT EXISTS public.marketly_listing_renewals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), listing_id uuid NOT NULL REFERENCES public.listings(id),
 seller_id uuid NOT NULL REFERENCES public.profiles(id), billing_month date NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(listing_id,billing_month)
);
CREATE INDEX IF NOT EXISTS marketly_renewal_month_idx ON public.marketly_listing_renewals(seller_id,billing_month);
ALTER TABLE public.marketly_listing_renewals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.marketly_listing_renewals FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.marketly_listing_renewals TO authenticated;
CREATE POLICY "Owner sees renewal ledger" ON public.marketly_listing_renewals
 FOR SELECT TO authenticated USING(seller_id=(SELECT auth.uid()));

-- Compatibility with existing publish RPC: a ledger insert checks combined free quota.
CREATE OR REPLACE FUNCTION public.marketly_guard_combined_posting_quota()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE v_used integer;
BEGIN
 SELECT (SELECT count(*) FROM public.listing_post_ledger WHERE seller_id=NEW.seller_id AND billing_month=NEW.billing_month)
      + (SELECT count(*) FROM public.marketly_listing_renewals WHERE seller_id=NEW.seller_id AND billing_month=NEW.billing_month)
 INTO v_used;
 IF v_used>=3 THEN RAISE EXCEPTION 'FREE_AD_QUOTA_EXCEEDED'; END IF;
 RETURN NEW;
END$$;
DROP TRIGGER IF EXISTS marketly_combined_posting_quota ON public.listing_post_ledger;
CREATE TRIGGER marketly_combined_posting_quota BEFORE INSERT ON public.listing_post_ledger
 FOR EACH ROW EXECUTE FUNCTION public.marketly_guard_combined_posting_quota();

CREATE OR REPLACE FUNCTION public.marketly_change_listing_status(p_listing_id uuid,p_action text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_owner uuid:=auth.uid(); v_status text; v_review text; v_expiry timestamptz;
 v_month date:=date_trunc('month',timezone('Asia/Colombo',now()))::date; v_used integer;
BEGIN
 IF v_owner IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
 SELECT status,moderation_status,expires_at INTO v_status,v_review,v_expiry
 FROM public.listings WHERE id=p_listing_id AND seller_id=v_owner FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_YOUR_AD'; END IF;
 IF v_status='deleted' THEN RAISE EXCEPTION 'AD_ALREADY_DELETED'; END IF;
 IF p_action='sold' THEN
  IF v_status<>'active' OR v_review<>'approved' OR v_expiry<=now() THEN RAISE EXCEPTION 'NOT_APPROVED_ACTIVE'; END IF;
  UPDATE public.listings SET status='sold' WHERE id=p_listing_id;
 ELSIF p_action='pause' THEN
  IF v_status<>'active' THEN RAISE EXCEPTION 'ONLY_ACTIVE_AD_CAN_BE_PAUSED'; END IF;
  UPDATE public.listings SET status='removed' WHERE id=p_listing_id;
 ELSIF p_action='relist' THEN
  IF v_status NOT IN ('sold','removed') AND NOT (v_status='active' AND v_expiry<=now())
    THEN RAISE EXCEPTION 'NOT_ELIGIBLE_TO_RELIST'; END IF;
  IF v_expiry IS NULL OR v_expiry<=now() THEN
    PERFORM pg_advisory_xact_lock(hashtext(v_owner::text),hashtext(v_month::text));
    SELECT (SELECT count(*) FROM public.listing_post_ledger WHERE seller_id=v_owner AND billing_month=v_month)
         + (SELECT count(*) FROM public.marketly_listing_renewals WHERE seller_id=v_owner AND billing_month=v_month)
    INTO v_used;
    IF v_used>=3 THEN RAISE EXCEPTION 'FREE_AD_QUOTA_EXCEEDED_RENEWAL'; END IF;
    INSERT INTO public.marketly_listing_renewals(listing_id,seller_id,billing_month)
    VALUES(p_listing_id,v_owner,v_month);
    UPDATE public.listings SET renewal_pending=true WHERE id=p_listing_id;
  END IF;
  UPDATE public.listings SET status='active',moderation_status='pending',reviewed_at=NULL,
    moderation_note=NULL WHERE id=p_listing_id;
 ELSIF p_action='delete' THEN
  UPDATE public.listings SET status='deleted',deleted_at=now() WHERE id=p_listing_id;
 ELSE RAISE EXCEPTION 'INVALID_STATUS'; END IF;
END$$;
REVOKE ALL ON FUNCTION public.marketly_change_listing_status(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.marketly_change_listing_status(uuid,text) TO authenticated;

-- Public cannot browse expired approved ads; owner/admin can still manage them.
DROP POLICY IF EXISTS "Public sees approved ads, owners and admins see theirs" ON public.listings;
CREATE POLICY "Public sees approved ads, owners and admins see theirs" ON public.listings
 FOR SELECT TO anon,authenticated USING(
 (status='active' AND moderation_status='approved' AND expires_at>now())
 OR seller_id=(SELECT auth.uid()) OR public.marketly_is_admin());
DROP POLICY IF EXISTS "Images follow listing visibility" ON public.listing_images;
CREATE POLICY "Images follow listing visibility" ON public.listing_images
 FOR SELECT TO anon,authenticated USING(EXISTS(
 SELECT 1 FROM public.listings l WHERE l.id=listing_id AND (
 (l.status='active' AND l.moderation_status='approved' AND l.expires_at>now())
 OR l.seller_id=(SELECT auth.uid()) OR public.marketly_is_admin())));

-- Conversation-level blocking: history remains visible to participants.
CREATE TABLE IF NOT EXISTS public.marketly_chat_blocks (
 conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
 blocker_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(conversation_id,blocker_id)
);
ALTER TABLE public.marketly_chat_blocks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.marketly_chat_blocks FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.marketly_chat_blocks TO authenticated;
CREATE POLICY "See own conversation blocks" ON public.marketly_chat_blocks FOR SELECT TO authenticated
 USING(blocker_id=(SELECT auth.uid()));

CREATE TABLE IF NOT EXISTS public.marketly_chat_reports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
 reporter_id uuid NOT NULL REFERENCES public.profiles(id),
 reason text NOT NULL CHECK(reason IN ('spam','harassment','scam','other')),
 details text NOT NULL DEFAULT '' CHECK(char_length(details)<=500),
 status text NOT NULL DEFAULT 'open' CHECK(status IN('open','reviewed','dismissed')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS marketly_chat_reports_pending_idx ON public.marketly_chat_reports(status,created_at DESC);
ALTER TABLE public.marketly_chat_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.marketly_chat_reports FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.marketly_chat_reports TO authenticated;
CREATE POLICY "Chat reports by reporter or admin" ON public.marketly_chat_reports FOR SELECT TO authenticated
 USING(reporter_id=(SELECT auth.uid()) OR public.marketly_is_admin());

CREATE OR REPLACE FUNCTION public.marketly_set_chat_block(p_conversation_id uuid,p_block boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_conv public.conversations%ROWTYPE; v_user uuid:=auth.uid();
BEGIN
 IF v_user IS NULL OR p_block IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
 SELECT * INTO v_conv FROM public.conversations WHERE id=p_conversation_id FOR UPDATE;
 IF NOT FOUND OR v_user NOT IN(v_conv.buyer_id,v_conv.seller_id) THEN RAISE EXCEPTION 'NOT_PARTICIPANT'; END IF;
 IF p_block THEN
  INSERT INTO public.marketly_chat_blocks(conversation_id,blocker_id) VALUES(p_conversation_id,v_user)
  ON CONFLICT DO NOTHING;
 ELSE DELETE FROM public.marketly_chat_blocks WHERE conversation_id=p_conversation_id AND blocker_id=v_user;
 END IF;
END$$;
REVOKE ALL ON FUNCTION public.marketly_set_chat_block(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.marketly_set_chat_block(uuid,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.marketly_report_chat(p_conversation_id uuid,p_reason text,p_details text DEFAULT '')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user uuid:=auth.uid();v_conv public.conversations%ROWTYPE;
BEGIN
 IF v_user IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
 IF p_reason NOT IN ('spam','harassment','scam','other') OR char_length(coalesce(p_details,''))>500 THEN
  RAISE EXCEPTION 'INVALID_REPORT'; END IF;
 SELECT * INTO v_conv FROM public.conversations WHERE id=p_conversation_id;
 IF NOT FOUND OR v_user NOT IN(v_conv.buyer_id,v_conv.seller_id) THEN RAISE EXCEPTION 'NOT_PARTICIPANT'; END IF;
 IF EXISTS(SELECT 1 FROM public.marketly_chat_reports WHERE conversation_id=p_conversation_id
    AND reporter_id=v_user AND created_at>now()-interval '24 hours') THEN RAISE EXCEPTION 'REPORT_LIMIT_ONE_PER_DAY'; END IF;
 INSERT INTO public.marketly_chat_reports(conversation_id,reporter_id,reason,details)
 VALUES(p_conversation_id,v_user,p_reason,btrim(coalesce(p_details,'')));
END$$;
REVOKE ALL ON FUNCTION public.marketly_report_chat(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.marketly_report_chat(uuid,text,text) TO authenticated;

-- Only administrators can resolve a reported conversation.
CREATE OR REPLACE FUNCTION public.marketly_review_chat_report(p_report_id uuid,p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.marketly_is_admin() THEN RAISE EXCEPTION 'ADMIN_REQUIRED'; END IF;
 IF p_status NOT IN ('reviewed','dismissed') THEN RAISE EXCEPTION 'INVALID_REVIEW_STATUS'; END IF;
 UPDATE public.marketly_chat_reports SET status=p_status WHERE id=p_report_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'REPORT_NOT_FOUND'; END IF;
END$$;
REVOKE ALL ON FUNCTION public.marketly_review_chat_report(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.marketly_review_chat_report(uuid,text) TO authenticated;

-- Chat permission is a live DB decision. The current listing state, NOT an old sold message, controls relist.
CREATE OR REPLACE FUNCTION public.marketly_chat_state(p_conversation_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user uuid:=auth.uid();v_conv public.conversations%ROWTYPE;v_listing public.listings%ROWTYPE;
 v_own boolean;v_their boolean;
BEGIN
 IF v_user IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
 SELECT * INTO v_conv FROM public.conversations WHERE id=p_conversation_id;
 IF NOT FOUND OR v_user NOT IN(v_conv.buyer_id,v_conv.seller_id) THEN RAISE EXCEPTION 'NOT_PARTICIPANT'; END IF;
 SELECT * INTO v_listing FROM public.listings WHERE id=v_conv.listing_id;
 SELECT EXISTS(SELECT 1 FROM public.marketly_chat_blocks WHERE conversation_id=p_conversation_id AND blocker_id=v_user),
   EXISTS(SELECT 1 FROM public.marketly_chat_blocks WHERE conversation_id=p_conversation_id AND blocker_id<>v_user)
 INTO v_own,v_their;
 RETURN jsonb_build_object('status',COALESCE(v_listing.status,'deleted'),
   'moderation',v_listing.moderation_status,'expires_at',v_listing.expires_at,
   'blocked_by_me',v_own,'blocked_by_other',v_their,
   'can_send',COALESCE(v_listing.status='active' AND v_listing.moderation_status='approved'
                    AND v_listing.expires_at>now(),false) AND NOT(v_own OR v_their));
END$$;
REVOKE ALL ON FUNCTION public.marketly_chat_state(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.marketly_chat_state(uuid) TO authenticated;

-- Prevent bypassing the disabled Send button through direct RPC calls.
CREATE OR REPLACE FUNCTION public.send_message(p_conversation_id uuid,p_body text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user uuid:=auth.uid();v_conv public.conversations%ROWTYPE;
 v_listing public.listings%ROWTYPE;v_id uuid;v_text text:=btrim(p_body);
BEGIN
 IF v_user IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
 IF v_text IS NULL OR char_length(v_text) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'INVALID_MESSAGE'; END IF;
 SELECT * INTO v_conv FROM public.conversations WHERE id=p_conversation_id;
 IF NOT FOUND OR v_user NOT IN(v_conv.buyer_id,v_conv.seller_id) THEN RAISE EXCEPTION 'NOT_PARTICIPANT'; END IF;
 -- Lock in the same listing -> conversation order as the Sold trigger to avoid deadlocks.
 SELECT * INTO v_listing FROM public.listings WHERE id=v_conv.listing_id FOR SHARE;
 PERFORM 1 FROM public.conversations WHERE id=p_conversation_id FOR UPDATE;
 IF NOT FOUND OR v_listing.status<>'active' OR v_listing.moderation_status<>'approved'
    OR v_listing.expires_at IS NULL OR v_listing.expires_at<=now() THEN RAISE EXCEPTION 'CHAT_CLOSED_ITEM_UNAVAILABLE'; END IF;
 IF EXISTS(SELECT 1 FROM public.marketly_chat_blocks WHERE conversation_id=p_conversation_id)
   THEN RAISE EXCEPTION 'CHAT_BLOCKED'; END IF;
 IF EXISTS(SELECT 1 FROM public.messages WHERE conversation_id=p_conversation_id
   AND sender_id=v_user AND NOT is_system AND created_at>now()-interval '2 seconds')
   THEN RAISE EXCEPTION 'MESSAGE_RATE_LIMIT'; END IF;
 INSERT INTO public.messages(conversation_id,sender_id,body) VALUES(p_conversation_id,v_user,v_text) RETURNING id INTO v_id;
 UPDATE public.conversations SET last_message_at=now() WHERE id=p_conversation_id;
 INSERT INTO public.notifications(recipient_id,actor_id,conversation_id,kind,title)
 VALUES(CASE WHEN v_user=v_conv.buyer_id THEN v_conv.seller_id ELSE v_conv.buyer_id END,
 v_user,p_conversation_id,'message','New message on your listing conversation');
 RETURN v_id;
END$$;
REVOKE ALL ON FUNCTION public.send_message(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.send_message(uuid,text) TO authenticated;

-- Read receipts: only recipient can mark messages as read, never edit message content.
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS read_at timestamptz;
CREATE OR REPLACE FUNCTION public.marketly_mark_chat_read(p_conversation_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user uuid:=auth.uid();v_conv public.conversations%ROWTYPE;v_count integer;
BEGIN
 IF v_user IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
 SELECT * INTO v_conv FROM public.conversations WHERE id=p_conversation_id;
 IF NOT FOUND OR v_user NOT IN(v_conv.buyer_id,v_conv.seller_id) THEN RAISE EXCEPTION 'NOT_PARTICIPANT'; END IF;
 UPDATE public.messages SET read_at=now() WHERE conversation_id=p_conversation_id
   AND sender_id<>v_user AND NOT is_system AND read_at IS NULL;
 GET DIAGNOSTICS v_count=ROW_COUNT; RETURN v_count;
END$$;
REVOKE ALL ON FUNCTION public.marketly_mark_chat_read(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.marketly_mark_chat_read(uuid) TO authenticated;

-- Inbox unread badges; RLS still restricts all underlying participant messages.
CREATE OR REPLACE FUNCTION public.marketly_unread_chat_counts()
RETURNS TABLE(conversation_id uuid,unread_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT m.conversation_id,count(*)::bigint FROM public.messages m
    JOIN public.conversations c ON c.id=m.conversation_id
    WHERE auth.uid() IS NOT NULL AND auth.uid() IN (c.buyer_id,c.seller_id)
      AND m.sender_id<>auth.uid() AND m.read_at IS NULL AND NOT m.is_system
    GROUP BY m.conversation_id
$$;
REVOKE ALL ON FUNCTION public.marketly_unread_chat_counts() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.marketly_unread_chat_counts() TO authenticated;

-- Follow sellers, with one notification per approved new listing.
CREATE TABLE IF NOT EXISTS public.marketly_seller_follows (
 follower_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 seller_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(follower_id,seller_id),
 CHECK(follower_id<>seller_id)
);
CREATE INDEX IF NOT EXISTS marketly_seller_follows_seller_idx ON public.marketly_seller_follows(seller_id);
ALTER TABLE public.marketly_seller_follows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.marketly_seller_follows FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.marketly_seller_follows TO authenticated;
CREATE POLICY "Follow owner sees relationships" ON public.marketly_seller_follows FOR SELECT TO authenticated
 USING(follower_id=(SELECT auth.uid()));
CREATE OR REPLACE FUNCTION public.marketly_toggle_seller_follow(p_seller_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user uuid:=auth.uid();
BEGIN
 IF v_user IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
 IF p_seller_id=v_user OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_seller_id) THEN
   RAISE EXCEPTION 'INVALID_SELLER'; END IF;
 DELETE FROM public.marketly_seller_follows WHERE follower_id=v_user AND seller_id=p_seller_id;
 IF FOUND THEN RETURN false; END IF;
 INSERT INTO public.marketly_seller_follows(follower_id,seller_id) VALUES(v_user,p_seller_id)
 ON CONFLICT DO NOTHING;
 RETURN true;
END$$;
REVOKE ALL ON FUNCTION public.marketly_toggle_seller_follow(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.marketly_toggle_seller_follow(uuid) TO authenticated;

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_kind_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_kind_check CHECK (
 kind IN ('message','offer','offer_accepted','offer_declined','offer_withdrawn','admin_listing_pending',
 'listing_approved','listing_rejected','admin_report','admin_verification','verification_approved',
 'verification_rejected','listing_sold','price_drop','seller_new_ad'));
CREATE UNIQUE INDEX IF NOT EXISTS marketly_one_seller_alert_per_listing ON public.notifications(recipient_id,listing_id,kind)
 WHERE kind='seller_new_ad';

-- Track lower asking prices during moderation; notify favourites ONLY after admin approves.
CREATE TABLE IF NOT EXISTS public.marketly_pending_price_drops (
 listing_id uuid PRIMARY KEY REFERENCES public.listings(id) ON DELETE CASCADE,
 previous_price bigint NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.marketly_pending_price_drops FROM PUBLIC,anon,authenticated;
ALTER TABLE public.marketly_pending_price_drops ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.marketly_track_price_edit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.price_lkr<OLD.price_lkr THEN
   INSERT INTO public.marketly_pending_price_drops(listing_id,previous_price) VALUES(NEW.id,OLD.price_lkr)
   ON CONFLICT (listing_id) DO UPDATE SET previous_price=GREATEST(
      public.marketly_pending_price_drops.previous_price,EXCLUDED.previous_price);
 ELSIF NEW.price_lkr>OLD.price_lkr THEN
   DELETE FROM public.marketly_pending_price_drops WHERE listing_id=NEW.id AND previous_price<=NEW.price_lkr;
 END IF;
 RETURN NEW;
END$$;
DROP TRIGGER IF EXISTS marketly_price_capture ON public.listings;
CREATE TRIGGER marketly_price_capture AFTER UPDATE OF price_lkr ON public.listings
 FOR EACH ROW WHEN (OLD.price_lkr IS DISTINCT FROM NEW.price_lkr) EXECUTE FUNCTION public.marketly_track_price_edit();

CREATE OR REPLACE FUNCTION public.marketly_notify_approved_listing()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_old_price bigint;
BEGIN
 IF NEW.status='active' AND NEW.moderation_status='approved' AND NEW.expires_at>now()
 AND (OLD.moderation_status IS DISTINCT FROM 'approved' OR OLD.status IS DISTINCT FROM 'active') THEN
  INSERT INTO public.notifications(recipient_id,actor_id,listing_id,kind,title)
  SELECT f.follower_id,NEW.seller_id,NEW.id,'seller_new_ad',left('New ad from a seller you follow: '||NEW.title,140)
  FROM public.marketly_seller_follows f WHERE f.seller_id=NEW.seller_id
  ON CONFLICT DO NOTHING;
  SELECT previous_price INTO v_old_price FROM public.marketly_pending_price_drops WHERE listing_id=NEW.id;
  IF FOUND AND NEW.price_lkr<v_old_price THEN
    INSERT INTO public.notifications(recipient_id,actor_id,listing_id,kind,title)
    SELECT fav.user_id,NEW.seller_id,NEW.id,'price_drop',left('Price dropped: '||NEW.title,140)
    FROM public.favorites fav WHERE fav.listing_id=NEW.id AND fav.user_id<>NEW.seller_id;
  END IF;
  DELETE FROM public.marketly_pending_price_drops WHERE listing_id=NEW.id;
 END IF;
 RETURN NEW;
END$$;
DROP TRIGGER IF EXISTS marketly_approved_listing_alert ON public.listings;
CREATE TRIGGER marketly_approved_listing_alert AFTER UPDATE OF moderation_status,status ON public.listings
 FOR EACH ROW EXECUTE FUNCTION public.marketly_notify_approved_listing();

-- A paused or expired listing cannot be used for fresh offers. Existing offers stay in history.
CREATE OR REPLACE FUNCTION public.make_offer(p_conversation_id uuid,p_amount_lkr bigint)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user uuid:=auth.uid();v_conv public.conversations%ROWTYPE;v_id uuid;
BEGIN
 IF v_user IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
 IF p_amount_lkr NOT BETWEEN 1 AND 999999999 THEN RAISE EXCEPTION 'INVALID_OFFER_AMOUNT'; END IF;
 SELECT * INTO v_conv FROM public.conversations WHERE id=p_conversation_id FOR UPDATE;
 IF NOT FOUND OR v_conv.buyer_id<>v_user THEN RAISE EXCEPTION 'ONLY_BUYER_CAN_OFFER'; END IF;
 IF EXISTS(SELECT 1 FROM public.marketly_chat_blocks WHERE conversation_id=p_conversation_id) THEN RAISE EXCEPTION 'CHAT_BLOCKED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.listings WHERE id=v_conv.listing_id
   AND status='active' AND moderation_status='approved' AND expires_at>now()) THEN RAISE EXCEPTION 'LISTING_NOT_AVAILABLE'; END IF;
 IF EXISTS(SELECT 1 FROM public.offers WHERE conversation_id=p_conversation_id AND status='pending') THEN RAISE EXCEPTION 'PENDING_OFFER_EXISTS'; END IF;
 INSERT INTO public.offers(conversation_id,buyer_id,amount_lkr) VALUES(p_conversation_id,v_user,p_amount_lkr) RETURNING id INTO v_id;
 UPDATE public.conversations SET last_message_at=now() WHERE id=p_conversation_id;
 INSERT INTO public.notifications(recipient_id,actor_id,conversation_id,kind,title)
 VALUES(v_conv.seller_id,v_user,p_conversation_id,'offer','You received a price offer');
 RETURN v_id;
END$$;
REVOKE ALL ON FUNCTION public.make_offer(uuid,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.make_offer(uuid,bigint) TO authenticated;

-- Pending offers cannot be accepted after a listing expires or chat is blocked.
CREATE OR REPLACE FUNCTION public.respond_to_offer(p_offer_id uuid,p_accept boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user uuid:=auth.uid();v_conv public.conversations%ROWTYPE;v_offer public.offers%ROWTYPE;
BEGIN
 IF v_user IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
 SELECT * INTO v_offer FROM public.offers WHERE id=p_offer_id FOR UPDATE;
 IF NOT FOUND OR v_offer.status<>'pending' THEN RAISE EXCEPTION 'OFFER_NOT_PENDING'; END IF;
 SELECT * INTO v_conv FROM public.conversations WHERE id=v_offer.conversation_id;
 IF NOT FOUND OR v_conv.seller_id<>v_user THEN RAISE EXCEPTION 'ONLY_SELLER_CAN_RESPOND'; END IF;
 IF EXISTS(SELECT 1 FROM public.marketly_chat_blocks WHERE conversation_id=v_conv.id) THEN RAISE EXCEPTION 'CHAT_BLOCKED'; END IF;
 IF p_accept AND NOT EXISTS(SELECT 1 FROM public.listings WHERE id=v_conv.listing_id
   AND status='active' AND moderation_status='approved' AND expires_at>now()) THEN RAISE EXCEPTION 'AD_NOT_AVAILABLE'; END IF;
 UPDATE public.offers SET status=CASE WHEN p_accept THEN 'accepted' ELSE 'declined' END,updated_at=now() WHERE id=p_offer_id;
 UPDATE public.conversations SET last_message_at=now() WHERE id=v_conv.id;
 INSERT INTO public.notifications(recipient_id,actor_id,conversation_id,kind,title)
 VALUES(v_conv.buyer_id,v_user,v_conv.id,CASE WHEN p_accept THEN 'offer_accepted' ELSE 'offer_declined' END,
 CASE WHEN p_accept THEN 'Your offer was accepted' ELSE 'Your offer was declined' END);
END$$;
REVOKE ALL ON FUNCTION public.respond_to_offer(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.respond_to_offer(uuid,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.start_conversation(p_listing_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user uuid:=auth.uid();v_seller uuid;v_id uuid;
BEGIN
 IF v_user IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
 SELECT seller_id INTO v_seller FROM public.listings WHERE id=p_listing_id
   AND status='active' AND moderation_status='approved' AND expires_at>now();
 IF v_seller IS NULL THEN RAISE EXCEPTION 'LISTING_NOT_AVAILABLE'; END IF;
 IF v_user=v_seller THEN RAISE EXCEPTION 'CANNOT_CONTACT_YOURSELF'; END IF;
 INSERT INTO public.conversations(listing_id,buyer_id,seller_id)
 VALUES(p_listing_id,v_user,v_seller) ON CONFLICT (listing_id,buyer_id) DO NOTHING;
 SELECT id INTO v_id FROM public.conversations WHERE listing_id=p_listing_id AND buyer_id=v_user;
 RETURN v_id;
END$$;
REVOKE ALL ON FUNCTION public.start_conversation(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.start_conversation(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.toggle_favorite(p_listing_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user uuid:=auth.uid();
BEGIN
 IF v_user IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
 DELETE FROM public.favorites WHERE user_id=v_user AND listing_id=p_listing_id;
 IF FOUND THEN RETURN false; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.listings WHERE id=p_listing_id AND status='active'
   AND moderation_status='approved' AND expires_at>now()) THEN RAISE EXCEPTION 'LISTING_NOT_AVAILABLE'; END IF;
 INSERT INTO public.favorites(user_id,listing_id) VALUES(v_user,p_listing_id)
 ON CONFLICT (user_id,listing_id) DO NOTHING;
 RETURN true;
END$$;
REVOKE ALL ON FUNCTION public.toggle_favorite(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.toggle_favorite(uuid) TO authenticated;

-- Existing RLS and public access to private chat tables remain unchanged.
COMMIT;
