-- READ-ONLY verification. Run in Supabase SQL Editor after applying migration.
select table_schema, table_name from information_schema.tables
where table_schema='public' and table_name in ('profiles','listings','listing_images','listing_post_ledger')
order by table_name;

select schemaname, tablename, rowsecurity from pg_tables
where schemaname='public' and tablename in ('profiles','listings','listing_images','listing_post_ledger')
order by tablename;

select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets where id='listing-images';

select proname, prosecdef from pg_proc
where proname in ('publish_listing','set_listing_status');
