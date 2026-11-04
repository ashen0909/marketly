-- MARKETLY v0.5 / Phase 03 - run AFTER migrations 001 and 002.
-- Private conversations, messages, offers, in-app notifications and saved ads.
-- All writes go through narrowly scoped authenticated SECURITY DEFINER functions.
-- Re-running this migration is safe for tables, policies, functions and publication memberships.

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  unique (listing_id, buyer_id),
  constraint no_self_conversation check (buyer_id <> seller_id)
);
create index if not exists conversations_buyer_recent_idx on public.conversations (buyer_id,last_message_at desc);
create index if not exists conversations_seller_recent_idx on public.conversations (seller_id,last_message_at desc);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists messages_conversation_recent_idx on public.messages (conversation_id,created_at desc,id desc);

create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  amount_lkr bigint not null check (amount_lkr between 1 and 999999999),
  status text not null default 'pending' check (status in ('pending','accepted','declined','withdrawn')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists offers_conversation_recent_idx on public.offers (conversation_id,created_at desc);
create unique index if not exists offers_one_pending_per_conversation on public.offers(conversation_id) where status='pending';

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete cascade,
  kind text not null check (kind in ('message','offer','offer_accepted','offer_declined','offer_withdrawn')),
  title text not null check (char_length(title) between 1 and 140),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists notifications_recipient_recent_idx on public.notifications(recipient_id,created_at desc);
create index if not exists notifications_unread_idx on public.notifications(recipient_id,created_at desc) where read_at is null;

create table if not exists public.favorites (
  user_id uuid not null references public.profiles(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(user_id,listing_id)
);
create index if not exists favorites_user_recent_idx on public.favorites(user_id,created_at desc);

alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.offers enable row level security;
alter table public.notifications enable row level security;
alter table public.favorites enable row level security;

-- Expose reads ONLY to signed-in participants. No direct table-write grants.
revoke all on table public.conversations, public.messages, public.offers, public.notifications, public.favorites from anon, authenticated;
grant select on table public.conversations, public.messages, public.offers, public.notifications, public.favorites to authenticated;

drop policy if exists "Conversation participants can read" on public.conversations;
create policy "Conversation participants can read" on public.conversations
  for select to authenticated
  using (buyer_id = (select auth.uid()) or seller_id = (select auth.uid()));

drop policy if exists "Conversation participants can read messages" on public.messages;
create policy "Conversation participants can read messages" on public.messages
  for select to authenticated
  using (exists (select 1 from public.conversations c where c.id=conversation_id
    and (c.buyer_id=(select auth.uid()) or c.seller_id=(select auth.uid()))));

drop policy if exists "Conversation participants can read offers" on public.offers;
create policy "Conversation participants can read offers" on public.offers
  for select to authenticated
  using (exists (select 1 from public.conversations c where c.id=conversation_id
    and (c.buyer_id=(select auth.uid()) or c.seller_id=(select auth.uid()))));

drop policy if exists "People can see only their notifications" on public.notifications;
create policy "People can see only their notifications" on public.notifications
  for select to authenticated using (recipient_id=(select auth.uid()));

drop policy if exists "People can see only their favorites" on public.favorites;
create policy "People can see only their favorites" on public.favorites
  for select to authenticated using (user_id=(select auth.uid()));

-- Chat initiation: a buyer can contact only the owner of an ACTIVE real listing.
create or replace function public.start_conversation(p_listing_id uuid)
returns uuid language plpgsql security definer set search_path=public, pg_temp as $$
declare
  v_user uuid := auth.uid();
  v_seller uuid;
  v_id uuid;
begin
  if v_user is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_listing_id is null then raise exception 'INVALID_LISTING'; end if;
  select seller_id into v_seller from public.listings where id=p_listing_id and status='active';
  if v_seller is null then raise exception 'LISTING_NOT_AVAILABLE'; end if;
  if v_user=v_seller then raise exception 'CANNOT_CONTACT_YOURSELF'; end if;
  insert into public.conversations(listing_id,buyer_id,seller_id)
    values (p_listing_id,v_user,v_seller)
    on conflict (listing_id,buyer_id) do nothing;
  select id into v_id from public.conversations where listing_id=p_listing_id and buyer_id=v_user;
  if v_id is null then raise exception 'CONVERSATION_NOT_CREATED'; end if;
  return v_id;
end;
$$;
revoke all on function public.start_conversation(uuid) from public, anon;
grant execute on function public.start_conversation(uuid) to authenticated;

-- Send text: server decides sender, recipient and notification; never trust client IDs.
create or replace function public.send_message(p_conversation_id uuid,p_body text)
returns uuid language plpgsql security definer set search_path=public, pg_temp as $$
declare
  v_user uuid := auth.uid();
  v_conv public.conversations%rowtype;
  v_id uuid;
  v_text text := btrim(p_body);
begin
  if v_user is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if v_text is null or char_length(v_text) not between 1 and 2000 then raise exception 'INVALID_MESSAGE'; end if;
  select * into v_conv from public.conversations where id=p_conversation_id for update;
  if not found or v_user not in (v_conv.buyer_id,v_conv.seller_id) then raise exception 'NOT_CONVERSATION_PARTICIPANT'; end if;
  -- Basic spam brake; only one message from same sender within each 2-second window.
  if exists (select 1 from public.messages
     where conversation_id=p_conversation_id and sender_id=v_user and created_at > now()-interval '2 seconds') then
    raise exception 'MESSAGE_RATE_LIMIT';
  end if;
  insert into public.messages(conversation_id,sender_id,body)
    values(p_conversation_id,v_user,v_text) returning id into v_id;
  update public.conversations set last_message_at=now() where id=p_conversation_id;
  insert into public.notifications(recipient_id,actor_id,conversation_id,kind,title)
    values(case when v_user=v_conv.buyer_id then v_conv.seller_id else v_conv.buyer_id end,
           v_user,p_conversation_id,'message','New message on your listing conversation');
  return v_id;
end;
$$;
revoke all on function public.send_message(uuid,text) from public, anon;
grant execute on function public.send_message(uuid,text) to authenticated;

create or replace function public.make_offer(p_conversation_id uuid,p_amount_lkr bigint)
returns uuid language plpgsql security definer set search_path=public, pg_temp as $$
declare
  v_user uuid := auth.uid();
  v_conv public.conversations%rowtype;
  v_id uuid;
begin
  if v_user is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_amount_lkr is null or p_amount_lkr not between 1 and 999999999 then raise exception 'INVALID_OFFER_AMOUNT'; end if;
  select * into v_conv from public.conversations where id=p_conversation_id for update;
  if not found or v_conv.buyer_id<>v_user then raise exception 'ONLY_BUYER_CAN_OFFER'; end if;
  if not exists(select 1 from public.listings where id=v_conv.listing_id and status='active') then raise exception 'LISTING_NOT_AVAILABLE'; end if;
  if exists(select 1 from public.offers where conversation_id=p_conversation_id and status='pending') then
    raise exception 'PENDING_OFFER_EXISTS';
  end if;
  insert into public.offers(conversation_id,buyer_id,amount_lkr)
    values(p_conversation_id,v_user,p_amount_lkr) returning id into v_id;
  update public.conversations set last_message_at=now() where id=p_conversation_id;
  insert into public.notifications(recipient_id,actor_id,conversation_id,kind,title)
    values(v_conv.seller_id,v_user,p_conversation_id,'offer','You received a price offer');
  return v_id;
end;
$$;
revoke all on function public.make_offer(uuid,bigint) from public, anon;
grant execute on function public.make_offer(uuid,bigint) to authenticated;

create or replace function public.respond_to_offer(p_offer_id uuid,p_accept boolean)
returns void language plpgsql security definer set search_path=public, pg_temp as $$
declare
  v_user uuid := auth.uid();
  v_conv public.conversations%rowtype;
  v_offer public.offers%rowtype;
begin
  if v_user is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into v_offer from public.offers where id=p_offer_id for update;
  if not found or v_offer.status<>'pending' then raise exception 'OFFER_NOT_PENDING'; end if;
  select * into v_conv from public.conversations where id=v_offer.conversation_id;
  if not found or v_conv.seller_id<>v_user then raise exception 'ONLY_SELLER_CAN_RESPOND'; end if;
  if p_accept and not exists(select 1 from public.listings where id=v_conv.listing_id and status='active') then
    raise exception 'LISTING_NOT_AVAILABLE';
  end if;
  update public.offers set status=case when p_accept then 'accepted' else 'declined' end,updated_at=now() where id=p_offer_id;
  update public.conversations set last_message_at=now() where id=v_conv.id;
  insert into public.notifications(recipient_id,actor_id,conversation_id,kind,title)
    values(v_conv.buyer_id,v_user,v_conv.id,
           case when p_accept then 'offer_accepted' else 'offer_declined' end,
           case when p_accept then 'Your offer was accepted' else 'Your offer was declined' end);
  -- Accepting an offer NEVER transfers money or marks the item sold.
end;
$$;
revoke all on function public.respond_to_offer(uuid,boolean) from public, anon;
grant execute on function public.respond_to_offer(uuid,boolean) to authenticated;

create or replace function public.withdraw_offer(p_offer_id uuid)
returns void language plpgsql security definer set search_path=public, pg_temp as $$
declare
  v_user uuid := auth.uid();
  v_conv public.conversations%rowtype;
  v_offer public.offers%rowtype;
begin
  if v_user is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into v_offer from public.offers where id=p_offer_id for update;
  if not found or v_offer.status<>'pending' or v_offer.buyer_id<>v_user then raise exception 'OFFER_NOT_WITHDRAWABLE'; end if;
  select * into v_conv from public.conversations where id=v_offer.conversation_id;
  update public.offers set status='withdrawn',updated_at=now() where id=p_offer_id;
  insert into public.notifications(recipient_id,actor_id,conversation_id,kind,title)
    values(v_conv.seller_id,v_user,v_conv.id,'offer_withdrawn','An offer was withdrawn');
end;
$$;
revoke all on function public.withdraw_offer(uuid) from public, anon;
grant execute on function public.withdraw_offer(uuid) to authenticated;

create or replace function public.toggle_favorite(p_listing_id uuid)
returns boolean language plpgsql security definer set search_path=public, pg_temp as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'NOT_AUTHENTICATED'; end if;
  delete from public.favorites where user_id=v_user and listing_id=p_listing_id;
  if found then return false; end if;
  if not exists(select 1 from public.listings where id=p_listing_id and status='active') then
    raise exception 'LISTING_NOT_AVAILABLE';
  end if;
  insert into public.favorites(user_id,listing_id) values(v_user,p_listing_id)
    on conflict (user_id,listing_id) do nothing;
  return true;
end;
$$;
revoke all on function public.toggle_favorite(uuid) from public, anon;
grant execute on function public.toggle_favorite(uuid) to authenticated;

create or replace function public.mark_notifications_read(p_ids uuid[])
returns integer language plpgsql security definer set search_path=public, pg_temp as $$
declare v_count integer;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if coalesce(cardinality(p_ids),0) > 100 then raise exception 'TOO_MANY_NOTIFICATIONS'; end if;
  update public.notifications set read_at=now()
    where recipient_id=auth.uid() and read_at is null and id=any(coalesce(p_ids,array[]::uuid[]));
  get diagnostics v_count=row_count;
  return v_count;
end;
$$;
revoke all on function public.mark_notifications_read(uuid[]) from public, anon;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;

-- Realtime Postgres Changes is appropriate for this MVP; evaluate private Broadcast
-- channels for larger scale. RLS ensures each authenticated subscriber can see
-- only their permitted rows. Existing publications must not be dropped.
do $$
begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='messages') then
      alter publication supabase_realtime add table public.messages;
    end if;
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='offers') then
      alter publication supabase_realtime add table public.offers;
    end if;
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='notifications') then
      alter publication supabase_realtime add table public.notifications;
    end if;
  end if;
end $$;

-- Verify from two DIFFERENT logged-in browsers. Never test authorization with service_role.
