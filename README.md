# Valora — Private Portfolio

A private portfolio platform for managing rental properties, units, and tenants —
with income/expense tracking, dashboards, financial reports, and CSV/PDF exports.

Built with **React 19 + TypeScript + Vite**, styled with **Tailwind CSS v4**, charts with
**Recharts**, and backed by **Supabase (Auth + Postgres + per-user RLS)** — with a local
browser-storage demo mode so you can start immediately without any setup.

## Features

- **Properties & Units** — manage buildings, unit numbers, rent amounts, and notes
- **Tenants** — contacts, lease dates, rent-due day, unit assignment, and payment status
- **Income Tracker** — rent, deposits, late fees, utility reimbursements, and more
- **Expense Tracker** — 9 tax-friendly categories, vendor/payee, and receipt uploads
- **Dashboard** — total income, expenses, NOI, occupancy, monthly trends, category breakdowns
- **Reports** — property performance comparison, tenant payment history, and outstanding balances
- **Date filters** — Month, Quarter, Year, or custom range (great for tax season)
- **Exports** — download reports as CSV or print-ready PDF (jsPDF)

## What's new (recently shipped)

### Brand & design
- **Valora rebrand** — private-bank aesthetic: ink-navy primary, champagne-gold accent, warm ivory canvas. Premium display serif (**Fraunces**) for headline figures/wordmark accents alongside **Inter** for UI text.
- **Dark mode** — the Valora navy is the primary dark surface; every card, input, and modal flips via a single `bg-surface` token. Includes a full dark-mode contrast pass (brightened semantic figures, navy-tinted chips/badges, dark-aware toasts and hover states).

### Motion & polish
- **Luxury entrance choreography** — the auth landing (logo → tagline → card), the loading screen, and every in-app page reveal with staggered, composed entrance animations (soft settle/rise/lift, gentle easing). The Dashboard staggers section-by-section (stat cards → charts → snapshot) and replays on navigation.
- **Logo hover interaction** — the Valora mark (auth, loading, and sidebar) gently lifts with a soft champagne glow on hover; all motion respects `prefers-reduced-motion`.
- **Compact auth landing** — the logo is the hero (up to 144px tall) while the page fits one screen without scrolling at phone, tablet, and laptop sizes.

### Accessibility & robustness
- **Form-field a11y** — all shared inputs/selects/textareas auto-assign stable ids, eliminating the browser's "form field should have an id or name" warning.
- **Dark-mode contrast audit** — every page reviewed in dark mode in the browser; no remaining low-contrast text or clashing pastel boxes.

## Quick start

```bash
npm install
npm run dev
```

The app runs in **demo mode** on first launch, pre-loaded with realistic sample data
(3 properties, 6 units, 6 tenants, ~14 months of transactions). Everything is stored in
your browser — no setup required. You can wipe or reload demo data anytime in **Settings**.

## Connecting Supabase (optional, recommended)

1. Create a project at [supabase.com](https://supabase.com) and copy your **Project URL**
   and **anon key** from *Project Settings → API*.
2. Open the **SQL Editor** in the Supabase dashboard and run the contents of
   [`supabase/schema.sql`](supabase/schema.sql). This creates the `properties`, `units`,
   `tenants`, `incomes`, and `expenses` tables with **Row Level Security** scoped to each
   signed-in owner, plus a **private** `receipts` storage bucket used for expense receipt
   uploads (served through signed URLs). It also creates the `owner_sessions` view and
   `revoke_owner_session` function that power the **Devices & Sessions** list in Settings
   (GoTrue has no admin endpoint for this, so sessions are read from `auth.sessions`
   through the API with the service-role key). Revoking a device deletes its session
   **and its refresh tokens** and broadcasts a Realtime event, so the revoked device
   is signed out **instantly** — even with its tab open. If Realtime is unavailable
   (e.g. blocked websockets), a ~60s session health check still signs the device out
   — using only that tab (never a broadcast that could sign out other devices in the
   same browser profile). Old revocation records are pruned automatically by a daily
   **pg_cron** job (`prune_session_revocations`, 03:00 server time) — enable the   pg_cron extension (Database → Extensions) if the schema step asks for it. A read-only `cron_job_status()` window function is also created so `npm run check:supabase` can verify the cron job's schedule and run history automatically. An optional security setting (Settings → Devices & Sessions) signs out every other device automatically whenever you change your password — enforced by a database trigger, so it applies to every device. **Already run this file before?** Re-run it after pulling updates to pick up new objects.
3. Copy `.env.example` to `.env` and fill in your keys:

   ```
   VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```

4. Restart the dev server. The sidebar will show **Supabase connected** and the app now
   requires **sign-in (Supabase Auth, email + password)**. Every user sees and edits only
   their own data — protected by per-user Row Level Security (`user_id = auth.uid()`).

> **Password policy:** the app requires **8+ characters** for new passwords and resets.
> For the same minimum to be enforced server-side (signups/resets made outside the app),
> set it in Supabase → **Authentication → Providers → Email → Minimum password length = 8**.

> **Deployed security headers:** `vercel.json` applies a Content-Security-Policy,
> `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, and a strict
> Referrer-Policy to the deployed site. The CSP's `script-src` hash is tied to the
> inline theme script in `index.html` — if you edit that script, regenerate the hash
> (the comment above the script explains how). The CSP also pins the Supabase project
> host, so if you switch projects update it in `vercel.json`. One minor effect: legacy
> external `https://` receipt URLs from very old backups no longer render as images
> (the CSP only allows the Supabase host, `data:`, and `blob:` images) — the link
> itself still opens.

> **Already have data?** Rows created before the upgrade have a `NULL user_id` and are
> invisible until claimed. After creating your account, copy your user id (Settings →
> Account & Security in the app, or Authentication → Users in Supabase) and run the
> backfill `UPDATE` statements listed at the top of `supabase/schema.sql`.

## Project structure

```
src/
  lib/          types, constants, formatters, supabase client, storage + seed data, data API
  store/        DataContext (global CRUD + lookups) and toast notifications
  utils/        reporting/analytics engine + CSV & PDF export
  components/   UI kit, layout/sidebar, charts, date-range filter, form selects
  pages/        Dashboard, Properties, Tenants, Incomes, Expenses, Reports, Settings
supabase/
  schema.sql    complete database schema with RLS policies
```

## Scripts

| Command          | Description                    |
| ---------------- | ------------------------------ |
| `npm run dev`    | Start the dev server           |
| `npm run build`  | Type-check and build for prod  |
| `npm run lint`   | Run oxlint                    |
| `npm run preview`| Preview the production build  |
| `npm run smoke`  | Run the data/reporting smoke tests |
| `npm run check:supabase` | Verify the Supabase connection, tables, RLS, and the pg_cron prune job (schedule + run history) — set `SUPABASE_SERVICE_ROLE_KEY` to include the cron checks |
| `npm run check:cron:arm` / `npm run check:cron:verify` | Belt-and-braces schedule check: `arm` plants a 2-day-old marker row in `session_revocations` (idempotent), `verify` confirms the nightly 03:00 prune job removed it — needs `VITE_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` |
| `npm run test:revocation` | Verify realtime cross-device sign-out on password change (needs Supabase + a test account) |
| `npm run test:revoke-browser` | Two-tab browser check of the revoke flow: the revoked tab signs out instantly and the revoking tab stays signed in — covering the Realtime path AND the health-check fallback with Realtime blocked (needs Chrome, the dev server running with Supabase keys, and a test account) |
| `npm run scan:secrets` | Scan for accidentally committed secrets |

> **Local dev note:** `vite.config.ts` proxies `/api` to the deployed site
> (`https://rpiet.vercel.app` by default; override with `DEV_API_TARGET`) so the
> Devices & Sessions serverless function also works in `npm run dev`.
