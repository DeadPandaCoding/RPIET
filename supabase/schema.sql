-- ============================================================================
-- PropertyLedger — Supabase schema
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query).
--
-- Creates: properties, units, tenants, incomes, expenses
-- Enables Row Level Security (RLS) on every table.
-- Creates a public storage bucket for expense receipts.
--
-- NOTE ON RLS: The policies below allow any client (anonymous or signed-in)
-- with the anon key to read/write. This matches the current single-user app
-- where the anon key is the only credential the browser holds.
-- To tighten to per-user ownership later, add a `user_id uuid` column to each
-- table, default `auth.uid()`, and replace the policies with:
--   ... for all using (user_id = auth.uid()) with check (user_id = auth.uid());
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- PROPERTIES
-- ---------------------------------------------------------------------------
create table if not exists public.properties (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  address    text not null,
  notes      text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- UNITS
-- ---------------------------------------------------------------------------
create table if not exists public.units (
  id          uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  unit_name   text not null,
  rent_amount numeric(12, 2) not null default 0 check (rent_amount >= 0),
  notes       text,
  created_at  timestamptz not null default now()
);

create index if not exists units_property_id_idx on public.units (property_id);

-- ---------------------------------------------------------------------------
-- TENANTS
-- ---------------------------------------------------------------------------
create table if not exists public.tenants (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  email         text,
  phone         text,
  unit_id       uuid references public.units (id) on delete set null,
  lease_start   date,
  lease_end     date,
  rent_due_date smallint check (rent_due_date between 1 and 31),
  notes         text,
  created_at    timestamptz not null default now()
);

create index if not exists tenants_unit_id_idx on public.tenants (unit_id);

-- ---------------------------------------------------------------------------
-- INCOMES
-- ---------------------------------------------------------------------------
create table if not exists public.incomes (
  id             uuid primary key default gen_random_uuid(),
  property_id    uuid not null references public.properties (id) on delete cascade,
  unit_id        uuid references public.units (id) on delete set null,
  tenant_id      uuid references public.tenants (id) on delete set null,
  date           date not null,
  category       text not null check (category in (
                   'Monthly Rent',
                   'Security Deposit',
                   'Late Fee',
                   'Utility Reimbursement',
                   'Other'
                 )),
  amount         numeric(12, 2) not null check (amount >= 0),
  payment_method text not null check (payment_method in (
                   'Cash',
                   'Check',
                   'Bank Transfer',
                   'Credit Card',
                   'Venmo',
                   'Zelle',
                   'PayPal',
                   'Other'
                 )),
  notes          text,
  created_at     timestamptz not null default now()
);

create index if not exists incomes_property_id_idx on public.incomes (property_id);
create index if not exists incomes_tenant_id_idx  on public.incomes (tenant_id);
create index if not exists incomes_date_idx       on public.incomes (date);

-- ---------------------------------------------------------------------------
-- EXPENSES
-- ---------------------------------------------------------------------------
create table if not exists public.expenses (
  id          uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  unit_id     uuid references public.units (id) on delete set null,
  date        date not null,
  category    text not null check (category in (
                'Mortgage Interest',
                'Property Tax',
                'Cleaning & Maintenance',
                'Appliance Repair',
                'Insurance',
                'Utilities',
                'HOA Fees',
                'Capital Improvements',
                'Other'
              )),
  amount      numeric(12, 2) not null check (amount >= 0),
  vendor      text,
  notes       text,
  receipt_url text,
  created_at  timestamptz not null default now()
);

create index if not exists expenses_property_id_idx on public.expenses (property_id);
create index if not exists expenses_date_idx        on public.expenses (date);

-- ---------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ---------------------------------------------------------------------------
alter table public.properties enable row level security;
alter table public.units      enable row level security;
alter table public.tenants    enable row level security;
alter table public.incomes    enable row level security;
alter table public.expenses   enable row level security;

create policy "Properties: all access" on public.properties
  for all using (true) with check (true);

create policy "Units: all access" on public.units
  for all using (true) with check (true);

create policy "Tenants: all access" on public.tenants
  for all using (true) with check (true);

create policy "Incomes: all access" on public.incomes
  for all using (true) with check (true);

create policy "Expenses: all access" on public.expenses
  for all using (true) with check (true);

-- ---------------------------------------------------------------------------
-- STORAGE — receipts bucket (for expense receipt uploads)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', true)
on conflict (id) do nothing;

create policy "Receipts: public read" on storage.objects
  for select using (bucket_id = 'receipts');

create policy "Receipts: upload" on storage.objects
  for insert with check (bucket_id = 'receipts');

create policy "Receipts: update" on storage.objects
  for update using (bucket_id = 'receipts');

create policy "Receipts: delete" on storage.objects
  for delete using (bucket_id = 'receipts');
