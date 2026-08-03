# PropertyLedger — Rental Property Income & Expense Tracker

A clean, modern web app for managing multiple rental properties, units, and tenants —
with income/expense tracking, dashboards, financial reports, and CSV/PDF exports.

Built with **React 19 + TypeScript + Vite**, styled with **Tailwind CSS v4**, charts with
**Recharts**, and backed by **Supabase (Postgres + RLS)** — with a local browser-storage
demo mode so you can start immediately without any setup.

## Features

- **Properties & Units** — manage buildings, unit numbers, rent amounts, and notes
- **Tenants** — contacts, lease dates, rent-due day, unit assignment, and payment status
- **Income Tracker** — rent, deposits, late fees, utility reimbursements, and more
- **Expense Tracker** — 9 tax-friendly categories, vendor/payee, and receipt uploads
- **Dashboard** — total income, expenses, NOI, occupancy, monthly trends, category breakdowns
- **Reports** — property performance comparison, tenant payment history, and outstanding balances
- **Date filters** — Month, Quarter, Year, or custom range (great for tax season)
- **Exports** — download reports as CSV or print-ready PDF (jsPDF)

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
   `tenants`, `incomes`, and `expenses` tables with **Row Level Security enabled**, plus
   the public `receipts` storage bucket used for expense receipt uploads.
3. Copy `.env.example` to `.env` and fill in your keys:

   ```
   VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```

4. Restart the dev server. The sidebar will show **Supabase connected** and all data now
   lives in your Postgres database, synced across devices.

> **RLS note:** the shipped policies allow read/write via the anon key, matching this
> single-user app. To switch to per-user ownership, add a `user_id` column defaulting to
> `auth.uid()` on each table and replace the policies with `using (user_id = auth.uid())`.
> The schema file contains the exact replacement snippet.

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
