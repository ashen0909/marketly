# Marketly: Supabase DB එකට Connect කිරීම (Step 1)

මේ version එකෙන් **Supabase Auth, profiles, listings, image upload, seller dashboard** database එකට සම්බන්ධ කරලා test කරන්න පුළුවන්. **Real chat, paid images, seller identity verification, boosts, real-world payments** තවම build කරලා නැහැ.

## 0. MacBook එකේ project backup එකක් තියාගන්න

පරණ `marketly-nextjs` folder එක overwrite කරන්න එපා. මේ ZIP එක වෙනම unzip කරන්න. පරණ `.env.local` එකේ settings තිබුණොත් ඒවා *අලුත් project එකේ* `.env.local` එකට copy කරන්න. **Service-role key / secret API key කිසිම public file එකකට, chat එකකට, හෝ GitHub එකකට දාන්න එපා**.

## 1. Supabase project එක create කරන්න

1. https://supabase.com/dashboard → **New project**.
2. Project name: `marketly-dev` වගේ නමක්, region එක closest available තෝරන්න.
3. Project එක ready වුණාම **SQL Editor** open කරන්න.
4. `supabase/migrations/202611040001_initial_marketplace.sql` file එකේ **සම්පූර්ණ SQL එක** copy කරලා SQL Editor → **Run**. **එකම project එකට එක වරක් පමණක් run කරන්න**. මේ migration එක tables, RLS policies, image bucket, server-side RPCs හදනවා.
5. Optional: `supabase/verify_setup.sql` එක run කරලා tables 4ටම `rowsecurity = true` බවත් `listing-images` bucket එක තියෙන බවත් බලන්න.

## 2. URL සහ public key දාන්න

Supabase Dashboard → **Project Settings / Connect / API Keys** තුළ:

- **Project URL:** `https://your-project-ref.supabase.co`
- **Publishable key:** සාමාන්‍යයෙන් `sb_publishable_...` (project එකේ publishable key). සමහර පැරණි projects වල `anon` public key භාවිතා කළ හැකියි.

Project root එකේ `.env.local` file එක edit කරන්න:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-real-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_real_key
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

`YOUR-PROJECT` වගේ placeholders තියාගෙන connect වෙන්නේ නැහැ. URL සහ public key browser app එකේ use කරන key දෙකයි; **service_role / secret key මෙතන දාන්න එපා**.

## 3. Authentication confirmation settings

Supabase → **Authentication → URL Configuration**:

- **Site URL** = `http://localhost:3000`
- Redirect URLs allow list එකට `http://localhost:3000/auth/confirm` සහ `http://localhost:3000/auth/callback` add කරන්න.

Supabase → **Authentication → Email Templates → Confirm signup**. Default confirmation link වෙනුවට server-side-compatible link එක දාන්න:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">Confirm your Marketly account</a>
```

**Settings:** Authentication → Providers → Email තුළ email provider enabled කරලා *Confirm email* active තියාගන්න (real users සදහා). Supabase built-in email sending වල rate limits තියෙන නිසා public launch එකට reliable SMTP service එකක් ඕන.

## 4. Mac terminal commands

```bash
cd ~/Downloads/marketly-db-step1
npm install
npm run db:check
npm run dev
```

Browser එකේ:

1. `http://localhost:3000/dev/setup` — database table checks green වෙනවාද බලන්න.
2. `http://localhost:3000/login` — Register කරලා email එක confirm කරන්න.
3. Sign in → `/dashboard` — free ads left **3** කියලා පෙන්වයි.
4. `/sell/new` — images **1–5** upload කරලා free ad publish කරන්න.
5. `/` or `/listings` — same ad එක public listings වල පෙනෙන්න ඕන.
6. Dashboard එකේ listing **Mark sold** test කරන්න.
7. Test another account in an incognito window to verify public viewing and seller-only permissions.

> Developer setup page production build එකේ 404 වෙනවා. Database itself is remote Supabase, so internet connection must work on the MacBook.

## 5. Image price සහ free quota

- Images 1–5: free; image 6 සිට extra image එකකට **Rs.10**.
- Payment gateway තව connect කරලා නැති නිසා images 6–12 වල **quote එක පමණයි පෙන්වන්නේ**. **Paid photos upload/publish කරන්න block වෙනවා.**
- Calendar month එකකට **3 free advertisements**, Sri Lanka timezone (`Asia/Colombo`) අනුව. Listing delete/sold කළත් quota නැවත ලැබෙන්නේ නැහැ.

## 6. Error troubleshooting

| Error | බලන්න ඕන දේ |
|---|---|
| `Invalid API key` | `.env.local` publishable key හරියට copy කරලාද? |
| `Failed to fetch` / networking | Supabase Project URL, project running ද, internet connection |
| `relation public.listings does not exist` | SQL migration run කරලා නැහැ / වෙනත් Supabase project එකක් connect කරලා |
| `Email not confirmed` | Inbox / spam / Email Template / Auth email confirmation settings |
| `Invalid or expired token` | Latest confirmation email link එක use කරන්න; mail link prefetching issue ද බලන්න |
| `Could not upload photo` | Storage `listing-images` bucket සහ policies, 5MB max, JPG/PNG/WEBP |
| `FREE_AD_QUOTA_EXCEEDED` | මෙමාසයේ ads 3 already posted — expected policy behavior |
| `EXTRA_IMAGE_PAYMENT_REQUIRED` | Images 5ට වැඩි. Gateway activation තව නැහැ |

## 7. Code quality checks

```bash
npm run lint
npm run typecheck
npm run test:pricing
npm run build
npm audit --omit=dev
```

`npm audit fix --force` පරිස්සමෙන් — dependency version breaks වෙන්න පුළුවන්.

## Public launch සඳහා තව අත්‍යවශ්‍ය දේවල්

Moderation/reporting, rate-limiting, image/content scanning, abuse prevention, contact/privacy policy, real identity verification if offered, paid uploads with verified webhooks, secure admin area, backups and restore tests, monitoring, performance tests. මේ first step එක live public deployment සඳහා තවම ready නොවේ.
