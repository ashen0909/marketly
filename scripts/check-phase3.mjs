/**
 * Marketly Phase 03 validation (v2).
 * Run: node --env-file=.env.local scripts/check-phase3.mjs
 * Never import this development-only check into browser code.
 * Checks the 5 private tables with a server credential, then checks
 * that an anonymous client cannot directly SELECT from them.
 * Uses GET (not HEAD): PostgREST's permission errors need a response body.
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
const serverKey = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)?.trim();

if (!url || !publishableKey || !serverKey || /YOUR-|PLACEHOLDER|EXAMPLE/i.test(url + publishableKey + serverKey)) {
  console.error('❌ Configure your Supabase URL, publishable key, and server-only key in .env.local.');
  process.exit(1);
}

let parsed;
try { parsed = new URL(url); }
catch { console.error('❌ NEXT_PUBLIC_SUPABASE_URL is not a valid URL.'); process.exit(1); }
if (!['http:', 'https:'].includes(parsed.protocol)) {
  console.error('❌ Supabase URL must use http or https.');
  process.exit(1);
}

const settings = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, serverKey, settings);
const guest = createClient(url, publishableKey, settings);
const tables = ['conversations', 'messages', 'offers', 'notifications', 'favorites'];
let failed = false;

function describe(result) {
  const error = result?.error;
  let body = '';
  if (error) {
    const pieces = [error.code, error.message, error.details, error.hint].filter(Boolean);
    body = pieces.length ? pieces.join(' | ') : String(error);
  }
  return `HTTP ${result?.status ?? '?'}${result?.statusText ? ` ${result.statusText}` : ''}${body ? ` — ${body}` : ''}`;
}

// Verify the public key is usable. An auth/network failure must not be
// mistaken for intentional denial of a private table.
try {
  const baseline = await guest.from('profiles').select('id').limit(1); // GET
  if (baseline.error) {
    console.error(`❌ Public-key baseline failed: ${describe(baseline)}`);
    process.exit(1);
  }
  console.log('✅ Public-key connection works (profiles readable)');
} catch (error) {
  console.error(`❌ Public-key connection failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

for (const table of tables) {
  try {
    const serverResult = await admin.from(table).select('*').limit(1); // GET
    if (serverResult.error) {
      console.error(`❌ ${table}: server check failed — ${describe(serverResult)}`);
      failed = true;
      continue;
    }

    const guestResult = await guest.from(table).select('*').limit(1); // GET, not HEAD
    if (!guestResult.error) {
      console.error(`❌ ${table}: anonymous direct SELECT succeeded. Check migration 003 grants/policies.`);
      failed = true;
      continue;
    }

    const err = guestResult.error;
    const permissionDenied = err.code === '42501' || /permission denied|insufficient privilege/i.test(err.message ?? '');
    if (permissionDenied) {
      console.log(`✅ ${table}: exists; anonymous SELECT denied (${describe(guestResult)})`);
    } else if ([401, 403].includes(guestResult.status)) {
      // A rejected request is consistent with protection, but could also be
      // a gateway/auth error. Do not mislabel it as verified table permissions.
      console.warn(`⚠️ ${table}: exists; anonymous request blocked (${describe(guestResult)}). Confirm permission error code 42501.`);
      failed = true;
    } else {
      console.error(`❌ ${table}: unexpected anonymous response — ${describe(guestResult)}`);
      failed = true;
    }
  } catch (error) {
    console.error(`❌ ${table}: request failed — ${error instanceof Error ? error.message : String(error)}`);
    failed = true;
  }
}

if (failed) {
  console.error('❌ Phase 03 diagnostic incomplete. Copy the error text (never API keys); do not rerun SQL migrations blindly.');
  process.exitCode = 1;
} else {
  console.log('✅ Phase 03 database tables and anonymous read protection verified.');
  console.log('Next: test chat and offers using two separate signed-in accounts.');
}
