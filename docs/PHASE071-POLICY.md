# Marketly Phase 07.1 — Profile & Reliability Policy

## Profile / verification
- One menu item **My Profile**. Every account can edit details after registration. New signups provide display name, email and password; can fill the rest later. Existing accounts are not locked out.
- Profile completion consists of 8 items: display name, full name, phone in +947XXXXXXXX format, district, city, About Me (10+ characters), contact preference, profile photo. No NIC, passport or street address is requested.
- Database `marketly_profile_details` is visible only to its owner; field updates use a SECURITY DEFINER RPC with input validation. Profile photo is served using short-lived signed links from a **private bucket**. No public buyer access to the owner's private fields by default.
- Profile 100% and an email-confirmed account are BOTH necessary for verification *request eligibility*. Admin approval remains mandatory. A complete profile, a mobile number or a business membership is never proof of identity.
- Changing a verified full name revokes prior `identity_verified=true` to require re-review. Display name edits alone do not.
- SMS OTP remains an external-configuration dependency. No phone verification badge is granted by simply typing a number.

## Dialogs / notifications
- Replace built-in `window.confirm/alert` dialogs with an accessible Marketly modal and non-blocking toast notifications. Actions that permanently remove ads/drafts or grant identity badges request confirmation; routine actions do not need more popups.

## Deleted photos / retention
- On a seller's soft deletion, only associated image references enter a private cleanup queue. The item stays deleted and chat history + posting ledger remain unchanged.
- A photo job is eligible **30 days after the listing was deleted**. Sold listings are never eligible. Nothing is auto-deleted in this phase.
- The local cleanup script defaults to dry run; destructive execution requires flags `--execute --backed-up` and confirmed independent database + image backups.
- During cleanup, storage objects are removed first. A privileged service-only DB RPC then removes archived image metadata. Other listing/offer/chat/ledger rows remain intact.

## Deferred to 07.1F / launch
- Legal policies, SEO/indexing, full production traffic/security audit and public launch readiness are NOT changed here.
- Live payments, paid credits, Cloudflare R2, advanced search, business storefront are still deferred.
