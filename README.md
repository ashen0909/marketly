# Marketly — Phase 1 DB connection: Next.js + Supabase marketplace

A modular **Next.js 16 / React 19 / TypeScript / Tailwind CSS 4 / shadcn/ui-style** marketplace foundation based on the approved Graphite + Brass Gold homepage design. This updated package adds a verified email-confirmation route and local database diagnostics.

**Start here:** Read [`SETUP-SINHALA.md`](SETUP-SINHALA.md) for the exact Supabase + MacBook setup steps. Copy `.env.example` to `.env.local`, set real project URL and publishable key, apply `supabase/migrations/202611040001_initial_marketplace.sql` to a **new** Supabase project, and run `npm run db:check`. Developer diagnostics: `http://localhost:3000/dev/setup` (development mode only).

## Git branching workflow

Keep `main` stable and ready for production. Use `develop` to combine and test completed work before it goes to `main`. Create a short-lived branch for each feature or fix; avoid committing feature work directly to `main`.

### One-time setup

The shared `develop` branch needs to exist on GitHub before other computers can check it out:

```bash
git switch develop
git push -u origin develop
```

### New feature or regular bug fix

Start from the latest `develop` branch. Use `feature/` for new functionality and `fix/` for a non-urgent bug fix:

```bash
git switch develop
git pull --ff-only origin develop
git switch -c feature/search-filters
```

When the work is ready, commit and push that branch, then open a GitHub Pull Request into `develop`:

```bash
git add <files-you-changed>
git commit -m "Add listing search filters"
git push -u origin feature/search-filters
```

For a regular bug fix, use a name such as `fix/listing-image-upload` and open its Pull Request into `develop`.

### Urgent production fix

Create a `hotfix/` branch from `main`, so the fix does not include unfinished work from `develop`:

```bash
git switch main
git pull --ff-only origin main
git switch -c hotfix/login-redirect
```

Commit and push the fix, then open a Pull Request into `main`:

```bash
git add <files-you-changed>
git commit -m "Fix login redirect"
git push -u origin hotfix/login-redirect
```

After the hotfix is merged into `main`, open another Pull Request from `main` into `develop` so both branches include the fix.

### Branch names at a glance

| Work | Branch example | Merge into |
|---|---|---|
| New feature | `feature/search-filters` | `develop` |
| Regular bug fix | `fix/listing-image-upload` | `develop` |
| Urgent production fix | `hotfix/login-redirect` | `main`, then sync `main` into `develop` |

Never commit `.env.local`, passwords, or Supabase secret/service-role keys. `.env.local` is ignored by Git; use `.env.example` for safe placeholders only.

## What is implemented in source code

- Mobile-first landing page, browse/search/filter, product detail pages and transparent membership prices.
- Email signup/login with Supabase Auth (when configured), session refresh via Next.js `proxy.ts`, user dashboard and logout.
- Product form with **up to 12 image previews**, first **5 photos FREE**, **Rs.10 per extra photo** calculated live.
- **Secure 1–5 photo publishing** using user-scoped Supabase Storage and an atomic PostgreSQL `publish_listing` RPC.
- **3 free ads each Asia/Colombo calendar month** enforced by immutable ledger + per-seller advisory transaction lock in PostgreSQL; deleting an ad does not restore quota.
- Mark-sold action (seller-only RPC). Public inventory shows only `active` items.
- React-based UI components, reusable pricing policy, environment variable separation, database RLS and baseline security rules.
- A small test suite for image pricing.

### Not yet implemented / not claimed to be live

- **Paid extra photos**: quote UI is built, but the 6th+ photo **cannot be published** until an approved payment provider is integrated, webhook verified, and database entitlements are added. Server & DB both intentionally reject unpaid extras.
- **Boosts**: proposed Rs.100/180/300 price cards only, no payment or promotion.
- Real buyer–seller chat, offers, phone OTP, identity verification, reviews, moderation, custom admin console, commercial memberships, paid seller boosts, shipping or escrow.
- Full rate limiting, image-content inspection, abuse protection, storage cleanup jobs, accessibility audits and performance/load tests are required before a public launch.
- Sample product photos and example listings appear **only when Supabase env vars are absent** and are labelled SAMPLE.

## Run the real Next.js project

**Requirements:** Node.js 20.9+ (Node.js 22 recommended), npm, a Supabase project.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. Without valid Supabase credentials the app is a **read-only UI preview**, and registration/publishing correctly remain disabled.

For real accounts and listings:

1. In Supabase, create a **new** project.
2. In SQL Editor apply `supabase/migrations/202611040001_initial_marketplace.sql`.
3. Copy your Project URL and **public/publishable (anon) key** to `.env.local`. Never put the service-role key in the frontend or `.env.example`.
4. Configure **Auth Site URL** as `http://localhost:3000`, allow both `/auth/confirm` and `/auth/callback`, then change the **Confirm signup** email template to `<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">Confirm account</a>`. For detail see `SETUP-SINHALA.md`. Note that live email confirmations need dependable SMTP configuration.
5. `npm run db:check` to confirm tables are accessible; `npm run dev`, visit `/dev/setup`, sign up, confirm email, and publish with 1–5 photos.
6. `npm run typecheck && npm run lint && npm run test:pricing && npm run build` before deployment.

> If you choose `src/app` the import alias is already set to `@/`. The project includes `components.json` so the shadcn CLI can add official components. Local Button/Input/Card components follow shadcn conventions without requiring a CLI run.

## Important decisions

**One account, two roles:** any user can buy or sell. No automatic seller verification badge. Server actions require authenticated users, RLS protects data, and SQL functions enforce posting limits even across simultaneous requests.

**Images:** maximum 12 per ad, 5 free, LKR 10 per extra. Price is display-only until payment. Never bypass the server/SQL payment gate or activate 6+ images without signed gateway webhooks and fraud-resistant entitlements.

**Monthly ledger:** the current month is calculated with the `Asia/Colombo` timezone in both TypeScript and PostgreSQL. Monthly posting is based on history, not current count of visible listings.

**Security:** Listing images are PUBLIC. Do not upload IDs, phone documents, receipts or other sensitive data there. Future identity verification requires an entirely separate private storage bucket and a legitimate data retention policy.

**Brand:** Marketly is a working name; domain and trademark rights remain to be checked.

## Development roadmap

1. **Phase 2 foundation (this ZIP):** Next.js, Supabase Auth, real listings with 1–5 photos, seller dashboard and transparent image pricing.
2. **Phase 3:** real conversation+messages+offers, saved listings, seller profile trust indicators, moderation and report functionality.
3. **Phase 4:** verification workflow and privacy controls; mobile usability and accessibility testing.
4. **Phase 5:** get payment provider approval; build invoice/order ledger, verified webhooks and refunds; then enable paid extra photo entitlements and 7/14/30-day boost packages.
5. **Phase 6:** production security review, rate limiting, logs/alerts, backups, load tests, domain, email/SMS, user support and deployment.

## Design tokens

- Graphite `#24272E`, Brass Gold `#B88746`, Warm White `#F6F5F2`, Sand `#DDD5C8`.

## Limitations of this artifact's validation

This build environment could not access the npm registry. Files are generated and the pure pricing policy can be tested with locally installed TypeScript, but full `npm install`, Next.js build, Supabase integration and browser end-to-end tests of the Next app **must be run after dependencies are installed**. Do not mistake this source project for an already deployed or production-audited website.
