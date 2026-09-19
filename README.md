# Roam — a shared trip planner

A mobile-first Next.js 16 + TypeScript + Supabase app, designed around 390 × 844. Email/password accounts, trips and invite links, members, itinerary CRUD, saved places with nearest-first geolocation sorting, equal expense splits and settlement suggestions, and a shared packing/to-do checklist.

## Existing project: additional SQL only

Run `supabase/migrations/002_covers_and_map_locations.sql` in Supabase SQL Editor on the existing project. **Do not rerun `001_initial.sql`.** The new migration is rerunnable, adds the missing map/cover columns, preserves existing rows and files, and recovers Storage paths from existing cover URLs. Deploy this code after running it.

The migration keeps `trip-covers`, makes it private, sets a 5 MB JPEG/PNG/WebP upload limit, and installs member-only Storage policies plus a checked `set_trip_cover` RPC. It also revokes direct trip/membership mutations and adds restrictive membership guards so permissive troubleshooting policies cannot bypass them. It does not remove policies for unrelated buckets. No manual bucket creation or RLS disabling is needed. Apply from the SQL Editor as the project database owner.

Email/password remains enabled; **leave Confirm email disabled for this MVP**. Set the Supabase Site URL to the final Vercel HTTPS origin after deployment. Browser geolocation needs HTTPS (or localhost). The app supports either `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` for the public key.

## Run locally

Use Node.js 22 or 24 and npm.

```sh
npm ci
cp .env.example .env.local
# Fill in the two public Supabase values below, then:
npm run dev
```

Open http://localhost:3000. Without environment variables the app shows an explicit setup message and an interactive sample trip. **Preview changes are memory-only and reset on reload; preview does not create accounts or write shared data.** A configured app also offers the preview from the login screen.

## Supabase setup (exact order)

1. Create a project at https://supabase.com/dashboard. Keep the database password private.
2. Open **SQL Editor → New query**. Paste all of `supabase/migrations/001_initial.sql`, then run it once on the new project. Next, run `supabase/migrations/002_covers_and_map_locations.sql`. The migration is transactional and creates all eight tables, indexes, foreign keys, policies, auth profile trigger, RPCs and Realtime publication entries. Do not rerun it on an already migrated database. Existing auth users are backfilled into `profiles`.
3. Open the project's **Connect** dialog or **Settings → API Keys**. Copy the project URL and **publishable key** into `.env.local`:

   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY
   ```

   The legacy `anon` key also works in the publishable-key variable. Never use a secret or service-role key in this browser application.

4. In **Authentication → Sign In / Providers → Email**, enable email/password sign-in. Leave email confirmation disabled for this MVP. Set the minimum password length to at least 8, matching the form.
5. In **Authentication → URL Configuration**, use `http://localhost:3000` as the development Site URL and add `http://localhost:3000` to Redirect URLs. If you use `127.0.0.1`, add `http://127.0.0.1:3000` too.
6. With confirmation disabled, signup returns an authenticated session immediately. SMTP setup is not needed for this signup flow; configure it if you later enable email confirmation or password-recovery email.
7. Restart `npm run dev` after changing `.env.local`. Sign up; you should enter the app immediately. The database automatically creates the UUID-linked profile.
8. Create a trip. Open the crew avatar, copy the invite link, and open it in a second browser with a second account. Choose **Join your friends**, then **Join trip**. Joining requires a valid random invite code and authentication.

Invite links remain valid until the creator chooses **Replace invite link**. Every member may edit shared activities, places, tasks and expenses, and may share the current invite. Only the creator may rotate it. Account deletion and member removal are deliberately outside this MVP; foreign keys prevent removing identities used in shared expenses.

## Deploy to Vercel today

1. Push this project, including `package-lock.json` and the migration, to your Git provider. Do not commit `.env.local`.
2. In https://vercel.com/new, import the repository. Choose **Next.js** as Framework Preset and the repository root as Root Directory.
3. Select **Node.js 22.x or 24.x**. Keep the defaults: Install Command `npm ci`, Build Command `npm run build`, Output Directory the Next.js default (do not set a custom directory).
4. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to the **Production** environment. Add the same names to **Preview** only if previews should access that Supabase project; a separate Supabase staging project is preferable.
5. Click **Deploy**. No server secret, separate backend, cron, or Vercel database is required. Public environment values are compiled at build time, so redeploy after changing them.
6. In Supabase **Authentication → URL Configuration**, set Site URL to your exact deployed HTTPS origin, such as `https://your-project.vercel.app`, and add that same origin to Redirect URLs. Retain localhost for development if needed. Add any custom domain and explicitly approved preview origins as well.
7. Visit the deployed app and repeat signup → create trip → invite second account → join → add/edit an activity → add an expense → toggle a task. Verify that changes appear for the other member. An unrelated third account should see only its own trips.
8. On a phone, use **Places → Find places near me** and allow location access. Browser location requires HTTPS (localhost also qualifies); denial and timeouts show recoverable errors. Coordinates stay in the browser and are not sent to Supabase.

Deployment has not been performed automatically: it needs your Supabase project and Vercel/Git account configuration. The repository is ready to import.

## Validation

```sh
npm test
npm run typecheck
npm run build
```

The tests use local PostgreSQL via PGlite, with mock Supabase `auth.users`/`auth.uid()` and database roles. They execute the actual migration and verify outsider isolation, anonymous denial, join authorization, idempotent membership, invite rotation, payer/participant validation, atomic rollback and cross-trip expense rejection. Storage tests also model permissive manual policies, verify migration reruns/data preservation, and exercise cover replacement/removal/conflicts. Map tests cover parsing, short links, legacy edits and combined distance sorting. Calculation tests cover penny remainders, zero-sum balances, settlement reconciliation, invalid money input and Haversine distance.

These do not replace the two-account hosted smoke test above: live Supabase Auth, Storage upload/signing, PostgREST relationships and Realtime require a configured project with both migrations applied. The local browser preview can be tested independently without credentials.

## Data and behavior

- Every relationship uses UUIDs, including payers and participants. Display names are presentation only.
- RLS protects every table. No client can insert membership or alter invitation codes directly; audited-purpose SQL functions create/join trips and rotate links. Functions set a fixed search path and check `auth.uid()`.
- Expense writes use a single atomic RPC. Composite foreign keys keep payers and participants in the expense's trip. Direct participant mutations are denied.
- Amounts are stored as integer cents. Equal splits assign any leftover cents in sorted UUID order, deterministically. Settlement suggestions cancel net balances; they do not initiate transfers, record repayment, or promise the minimum possible number of transfers.
- Each trip has one fixed currency; supported currencies use two decimal places in this app. Currency conversion is manual.
- Realtime notifications refresh the selected trip, with a 15-second visible-tab poll and focus refresh as fallback (also covering deletes). Changes are saved before success feedback. Concurrent edits use last-write-wins; this is not an offline app.
- Places and activities store a Google Maps URL and internal nullable coordinates. Explicit coordinate queries and place pins are parsed, with a map-camera coordinate used only as a fallback outside directions URLs. Short links and named searches are saved without coordinates; the app does not expand redirects or call a geocoding API.
- Near Me combines saved places and itinerary locations. Known distances sort first; locations without coordinates stay accessible through their Maps links after those results. Distances are approximate straight-line distances, not travel time.
- Trip covers use unique Storage object names. The RPC checks membership, object existence and the expected previous cover before changing the pointer. Failed replacements leave the previous cover in place; the old object is deleted only after a successful pointer update. Active images cannot be overwritten or deleted via the client. If old-file cleanup fails, the app reports it without undoing the saved cover.
- The hero uses a one-hour signed URL, refreshed on focus and every 45 minutes. Existing `cover_url` values are retained during migration, with their object paths backfilled into `cover_path`. On change/remove, `cover_url` is cleared to prevent the old image from reappearing. Covers remain within the existing hero crop and gradient; there is no cover hover/parallax.
- Activities use the destination's local calendar date and time; no automatic time-zone conversion is applied.

## Visual implementation

The supplied Aura HTML is a visual reference only: charcoal `#1c1e26`/`#181a22`, translucent white surfaces and borders, blue/purple ambient gradients, Inter typography, generous rounded corners and a floating pill navigation bar. Tap scales use 150–200 ms transitions, selections and sheets use 300 ms, with no cover hover or parallax. Reduced-motion preferences are honored. The recording is used only to compare motion; no hotel, booking, or product features are included.

Reusable UI primitives live in `components/ui.tsx`; authentication, forms and planner are separated into components. `lib/calculations.ts` contains pure financial and distance logic. The scenic illustration is a local SVG. The Google Fonts stylesheet is optional: system fonts provide the fallback if unavailable.
