/** Read-only diagnostic: exercises both the simple and old embedded query. No secrets are printed. */
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local');
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const columns = 'id,title,status,seller_id,published_at';
let failures = 0;
async function check(label, query) {
  const { data, error } = await query;
  if (error) {
    failures++;
    console.error(`❌ ${label}:`, JSON.stringify({ code: error.code, message: error.message, details: error.details, hint: error.hint }));
  } else {
    console.log(`✅ ${label}: query succeeded; returned ${data?.length ?? 0} rows (maximum 5)`);
  }
}
await check('Active listing rows', db.from('listings').select(columns).eq('status', 'active').limit(5));
await check('Old joined listing query', db.from('listings').select('id,title,profiles(display_name),listing_images(storage_path,position)').eq('status', 'active').limit(5));
await check('Public profiles', db.from('profiles').select('id,display_name').limit(5));
await check('Public listing images', db.from('listing_images').select('listing_id,storage_path,position').limit(5));
console.log(failures ? `Completed with ${failures} query failure(s). Please share only the error codes/messages, not .env.local.` : 'Public listings diagnostics passed. If listings still do not display, check the logged-in server request in the Next.js terminal.');
process.exitCode = failures ? 1 : 0;
