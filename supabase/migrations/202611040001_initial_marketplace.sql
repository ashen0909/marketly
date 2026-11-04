-- MARKETLY Phase 2 / SQL migration
-- Apply in a new Supabase project (SQL Editor) AFTER reviewing policies.
-- This schema enables 3 free ads per month and 1–5 free images per listing.
-- Paid extra images, verification and boosts are intentionally NOT activated.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 2 and 60),
  identity_verified boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function public.create_profile_for_new_user()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, left(coalesce(nullif(btrim(new.raw_user_meta_data->>'display_name'), ''), 'New member'), 60));
  return new;
end;
$$;
drop trigger if exists auth_create_marketly_profile on auth.users;
create trigger auth_create_marketly_profile after insert on auth.users
for each row execute function public.create_profile_for_new_user();

create table if not exists public.listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 5 and 90),
  description text not null check (char_length(btrim(description)) between 20 and 2500),
  price_lkr bigint not null check (price_lkr between 1 and 999999999),
  category text not null check (category in ('Mobiles','Vehicles','Property','Electronics','Home & Living','Fashion','Services','Other')),
  location text not null check (location in ('Colombo','Gampaha','Kalutara','Kandy','Matale','Nuwara Eliya','Galle','Matara','Hambantota','Jaffna','Kilinochchi','Mannar','Mullaitivu','Vavuniya','Trincomalee','Batticaloa','Ampara','Kurunegala','Puttalam','Anuradhapura','Polonnaruwa','Badulla','Monaragala','Ratnapura','Kegalle')),
  condition text not null check (condition in ('New','Used','Refurbished')),
  status text not null default 'active' check (status in ('active','sold','removed')),
  published_at timestamptz not null default now()
);
create index if not exists listings_active_recent_idx on public.listings (published_at desc) where status = 'active';
create index if not exists listings_seller_recent_idx on public.listings (seller_id, published_at desc);
create index if not exists listings_category_location_idx on public.listings(category,location) where status = 'active';

create table if not exists public.listing_images (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  storage_path text not null unique,
  position smallint not null check (position between 0 and 11),
  unique (listing_id, position)
);
create index if not exists listing_images_listing_idx on public.listing_images(listing_id,position);

-- Immutable posting ledger ensures deleting an ad never refunds a free slot.
create table if not exists public.listing_post_ledger (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(id) on delete cascade,
  listing_id uuid references public.listings(id) on delete set null,
  billing_month date not null,
  created_at timestamptz not null default now(),
  unique (listing_id)
);
create index if not exists listing_post_ledger_month_idx on public.listing_post_ledger(seller_id,billing_month);

-- Make reads private by default and expose only minimum public information.
alter table public.profiles enable row level security;
alter table public.listings enable row level security;
alter table public.listing_images enable row level security;
alter table public.listing_post_ledger enable row level security;

create policy "Public can see seller display names" on public.profiles
for select to anon, authenticated using (true);
-- Important: identity_verified is NOT user-writable; no UPDATE policy.

create policy "Public sees active listings and owners see theirs" on public.listings
for select to anon, authenticated using (status='active' or seller_id=(select auth.uid()));
-- No direct INSERT, UPDATE or DELETE policies. All writes use constrained SECURITY DEFINER RPCs.

create policy "Public sees images of visible listings" on public.listing_images
for select to anon, authenticated using (
  exists (select 1 from public.listings l where l.id=listing_id
    and (l.status='active' or l.seller_id=(select auth.uid())))
);
create policy "Sellers see their own posting ledger" on public.listing_post_ledger
for select to authenticated using (seller_id=(select auth.uid()));

-- Public images bucket: no private identity documents should ever be uploaded here.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('listing-images', 'listing-images', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=true, file_size_limit=5242880, allowed_mime_types=array['image/jpeg','image/png','image/webp'];

create policy "Users may upload photos only under their own ID" on storage.objects
for insert to authenticated with check (
  bucket_id='listing-images' and (storage.foldername(name))[1]=(select auth.uid())::text
);
create policy "Users can delete their own uploads" on storage.objects
for delete to authenticated using (
  bucket_id='listing-images' and (storage.foldername(name))[1]=(select auth.uid())::text
);
-- No storage.objects UPDATE policy to prevent replacing already approved images.

-- This function is the ONLY supported listing publishing path.
create or replace function public.publish_listing(
  p_title text, p_description text, p_price_lkr bigint,
  p_category text, p_location text, p_condition text, p_image_paths text[]
) returns uuid language plpgsql security definer set search_path=public, storage, pg_temp as $$
declare
  v_user uuid := auth.uid();
  v_month date := date_trunc('month', timezone('Asia/Colombo', now()))::date;
  v_id uuid;
  v_path text;
  v_count integer;
  v_index integer;
begin
  if v_user is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not exists(select 1 from public.profiles where id=v_user) then raise exception 'PROFILE_REQUIRED'; end if;
  if char_length(btrim(p_title)) not between 5 and 90
     or char_length(btrim(p_description)) not between 20 and 2500
     or p_price_lkr not between 1 and 999999999
     or p_category not in ('Mobiles','Vehicles','Property','Electronics','Home & Living','Fashion','Services','Other')
     or p_location not in ('Colombo','Gampaha','Kalutara','Kandy','Matale','Nuwara Eliya','Galle','Matara','Hambantota','Jaffna','Kilinochchi','Mannar','Mullaitivu','Vavuniya','Trincomalee','Batticaloa','Ampara','Kurunegala','Puttalam','Anuradhapura','Polonnaruwa','Badulla','Monaragala','Ratnapura','Kegalle')
     or p_condition not in ('New','Used','Refurbished') then
    raise exception 'INVALID_LISTING_DATA';
  end if;

  v_count := coalesce(array_length(p_image_paths,1),0);
  if v_count < 1 or v_count > 12 then raise exception 'INVALID_IMAGE_COUNT'; end if;
  if v_count > 5 then
    -- NEVER treat a client-side quote or screenshot as proof of payment.
    raise exception 'EXTRA_IMAGE_PAYMENT_REQUIRED';
  end if;
  if (select count(distinct x) from unnest(p_image_paths) as x) <> v_count then
    raise exception 'DUPLICATE_IMAGE';
  end if;
  foreach v_path in array p_image_paths loop
    if split_part(v_path, '/', 1) <> v_user::text
       or not exists (select 1 from storage.objects where bucket_id='listing-images' and name=v_path)
       or exists (select 1 from public.listing_images where storage_path=v_path) then
      raise exception 'INVALID_IMAGE_OWNERSHIP';
    end if;
  end loop;

  -- Serialize concurrent free-ad submissions for one seller, including two browser tabs.
  perform pg_advisory_xact_lock(hashtext(v_user::text), hashtext(v_month::text));
  if (select count(*) from public.listing_post_ledger where seller_id=v_user and billing_month=v_month) >= 3 then
    raise exception 'FREE_AD_QUOTA_EXCEEDED';
  end if;

  insert into public.listings(seller_id,title,description,price_lkr,category,location,condition)
  values(v_user,btrim(p_title),btrim(p_description),p_price_lkr,p_category,p_location,p_condition)
  returning id into v_id;

  for v_index in 1..v_count loop
    insert into public.listing_images(listing_id,storage_path,position)
    values(v_id,p_image_paths[v_index],v_index-1);
  end loop;
  insert into public.listing_post_ledger(seller_id,listing_id,billing_month)
  values(v_user,v_id,v_month);
  return v_id;
end;
$$;
revoke all on function public.publish_listing(text,text,bigint,text,text,text,text[]) from public;
grant execute on function public.publish_listing(text,text,bigint,text,text,text,text[]) to authenticated;

create or replace function public.set_listing_status(p_listing_id uuid,p_status text)
returns void language plpgsql security definer set search_path=public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_status <> 'sold' then raise exception 'UNSUPPORTED_STATUS'; end if;
  update public.listings set status='sold'
  where id=p_listing_id and seller_id=auth.uid() and status='active';
  if not found then raise exception 'LISTING_NOT_FOUND_OR_UNAUTHORIZED'; end if;
end;
$$;
revoke all on function public.set_listing_status(uuid,text) from public;
grant execute on function public.set_listing_status(uuid,text) to authenticated;

-- Follow-up hardening before PUBLIC LAUNCH:
-- rate limiting, audit logs, spam moderation, storage quota/garbage collection,
-- reporting & abuse workflow, security testing, backup/restore and payment reconciliation.
