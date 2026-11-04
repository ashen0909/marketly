-- MARKETLY v0.4 - apply ONCE on your EXISTING Supabase project.
-- Allows a signed-in user to change ONLY their own public display name.
-- No UPDATE policy on profiles; identity_verified remains admin-controlled.

create or replace function public.update_my_display_name(p_display_name text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_name text := btrim(p_display_name);
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if v_name is null or char_length(v_name) not between 2 and 60 then
    raise exception 'INVALID_DISPLAY_NAME';
  end if;
  insert into public.profiles (id, display_name)
  values (auth.uid(), v_name)
  on conflict (id) do update set display_name = excluded.display_name;
end;
$$;

revoke all on function public.update_my_display_name(text) from public;
grant execute on function public.update_my_display_name(text) to authenticated;

-- Prevent direct browser-to-Storage writes. All new photos must be watermarked
-- in the server API before a server-only secret key uploads the processed file.
-- The existing listing-images bucket remains PUBLIC for product photo viewing.
drop policy if exists "Users may upload photos only under their own ID" on storage.objects;
drop policy if exists "Users can delete their own uploads" on storage.objects;
-- Never expose the Supabase secret key to client code or the browser.
