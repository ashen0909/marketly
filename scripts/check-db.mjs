/** Run: npm run db:check (requires Node 20.6+ and a configured .env.local). */
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
if (!url || !key || /YOUR-|PLACEHOLDER|EXAMPLE/i.test(url + key)) {
  console.error('❌ Missing real Supabase Project URL / publishable key. Update .env.local first.');
  process.exit(1);
}
let parsed;
try { parsed = new URL(url); } catch { console.error('❌ Supabase URL is invalid.'); process.exit(1); }
if (!['https:', 'http:'].includes(parsed.protocol)) { console.error('❌ Supabase URL must use HTTP(S).'); process.exit(1); }

const client = createClient(url, key, {auth: {persistSession: false, autoRefreshToken: false}});
let fail = false;
for (const table of ['profiles', 'listings', 'listing_images', 'listing_post_ledger']) {
  try {
    const { error } = await client.from(table).select('id').limit(1);
    if (error) { console.error(`❌ ${table}: ${error.code || 'error'} ${error.message}`); fail = true; }
    else console.log(`✅ ${table}: reachable with public key (RLS active)`);
  } catch (error) { console.error(`❌ ${table}: ${error instanceof Error ? error.message : 'Network error'}`); fail = true; }
}
// Storage uploads are now server-only; verify that the admin key is configured
// without printing or exposing it to the browser.
const adminKey = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)?.trim();
if (!adminKey || /YOUR-|PLACEHOLDER|EXAMPLE/i.test(adminKey)) {
  console.error('❌ SUPABASE_SECRET_KEY is missing. Watermarked photo uploads will not work.');
  fail = true;
} else {
  try {
    const admin = createClient(url, adminKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await admin.storage.from('listing-images').list('', { limit: 1 });
    if (error) {
      console.error(`❌ Server photo storage: ${error.message}`);
      fail = true;
    } else {
      console.log('✅ Server photo storage: accessible using server-only key');
    }
  } catch {
    console.error('❌ Server photo storage could not be reached.');
    fail = true;
  }
}
if (fail) {
  console.error('Database check failed. Check project keys, SQL migration 002, Storage bucket, and your network connection.');
  process.exitCode = 1;
} else {
  console.log('✅ Basic database + server photo storage checks succeeded. Next: test profile updates and publishing.');
}
