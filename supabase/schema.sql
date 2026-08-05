-- ============================================================================
-- Valora — Supabase schema
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query).
--
-- Creates: properties, units, tenants, incomes, expenses
-- Enables Row Level Security (RLS) on every table, scoped to the signed-in
-- owner via auth.uid(). Every row belongs to the user who created it and can
-- only be read, updated, or deleted by that same user.
--
-- SAFE TO RE-RUN: uses IF NOT EXISTS / DROP POLICY IF EXISTS so it upgrades an
-- existing install (which previously allowed open anon access) in place.
-- Policies compare ids as text (user_id::text = auth.uid()::text) so they also
-- work on databases where a user_id column was previously created as text.
--
-- AFTER UPGRADING AN EXISTING PROJECT THAT ALREADY HAS DATA:
--   1. Open the app and create your account (sign up).
--   2. Copy your user id from Authentication → Users → your user → UUID.
--   3. Claim your existing rows so they aren't hidden by the new policies
--      (rows with a NULL user_id are invisible to everyone, including you):
--        update public.properties set user_id = 'YOUR-USER-UUID'::uuid where user_id is null;
--        update public.units      set user_id = 'YOUR-USER-UUID'::uuid where user_id is null;
--        update public.tenants    set user_id = 'YOUR-USER-UUID'::uuid where user_id is null;
--        update public.incomes    set user_id = 'YOUR-USER-UUID'::uuid where user_id is null;
--        update public.expenses   set user_id = 'YOUR-USER-UUID'::uuid where user_id is null;
--   4. The receipts bucket is now PRIVATE. Old public receipt URLs will stop
--      working; re-attach those receipts from the app (they are stored in the
--      new per-user <user-id>/ folder and served through signed URLs).
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- PROPERTIES
-- ---------------------------------------------------------------------------
create table if not exists public.properties (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid(),
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
  user_id     uuid not null default auth.uid(),
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
  user_id       uuid not null default auth.uid(),
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
  user_id        uuid not null default auth.uid(),
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
  user_id     uuid not null default auth.uid(),
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
-- UPGRADE EXISTING INSTALLS
-- Adds the user_id column to tables created before per-user ownership.
-- New inserts get auth.uid() automatically; pre-existing rows stay NULL until
-- you run the backfill UPDATEs listed in the header comment.
-- ---------------------------------------------------------------------------
alter table public.properties add column if not exists user_id uuid default auth.uid();
alter table public.units      add column if not exists user_id uuid default auth.uid();
alter table public.tenants    add column if not exists user_id uuid default auth.uid();
alter table public.incomes    add column if not exists user_id uuid default auth.uid();
alter table public.expenses   add column if not exists user_id uuid default auth.uid();

-- If user_id already exists as a text column (from an earlier partial setup),
-- convert it to uuid so the owner policies below can match auth.uid().
do $$
declare
  t text;
  col_type text;
begin
  foreach t in array array['properties', 'units', 'tenants', 'incomes', 'expenses']
  loop
    select data_type into col_type
    from information_schema.columns
    where table_schema = 'public'
      and table_name = t
      and column_name = 'user_id';

    if col_type is not null and col_type <> 'uuid' then
      execute format(
        'alter table public.%I alter column user_id type uuid using case when user_id ~ ''^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'' then user_id::uuid else null end',
        t
      );
      raise notice 'Converted user_id on % to uuid', t;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- ROW LEVEL SECURITY — owner only (cast-safe)
-- ---------------------------------------------------------------------------
alter table public.properties enable row level security;
alter table public.units      enable row level security;
alter table public.tenants    enable row level security;
alter table public.incomes    enable row level security;
alter table public.expenses   enable row level security;

-- Drop ANY existing policy on these tables — old "all access" policies from
-- earlier versions, partially applied runs, or re-runs — whatever their name.
-- This makes the file safe to run repeatedly, even over a stale copy of the
-- schema that still tries to create "<Table>: all access" policies.
do $$
declare
  pol record;
begin
  for pol in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('properties', 'units', 'tenants', 'incomes', 'expenses')
  loop
    execute format('drop policy if exists %I on public.%I', pol.policyname, pol.tablename);
  end loop;
end $$;

create policy "Properties: owner only" on public.properties
  for all using (user_id::text = auth.uid()::text) with check (user_id::text = auth.uid()::text);

create policy "Units: owner only" on public.units
  for all using (user_id::text = auth.uid()::text) with check (user_id::text = auth.uid()::text);

create policy "Tenants: owner only" on public.tenants
  for all using (user_id::text = auth.uid()::text) with check (user_id::text = auth.uid()::text);

create policy "Incomes: owner only" on public.incomes
  for all using (user_id::text = auth.uid()::text) with check (user_id::text = auth.uid()::text);

create policy "Expenses: owner only" on public.expenses
  for all using (user_id::text = auth.uid()::text) with check (user_id::text = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- STORAGE — receipts bucket (private, per-owner)
-- Files are uploaded under <user-id>/... folders; Supabase sets the object
-- owner automatically. Read/update/delete are limited to the object owner.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do update set public = false;

-- Drop any previous receipts-bucket policies (public-read or owner-scoped)
-- so this block can also be re-run safely.
do $$
declare
  pol record;
begin
  for pol in
    select tablename, policyname
    from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname like 'Receipts%'
  loop
    execute format('drop policy if exists %I on storage.objects', pol.policyname);
  end loop;
end $$;

create policy "Receipts: owner read" on storage.objects
  for select using (bucket_id = 'receipts' and owner_id::text = auth.uid()::text);

create policy "Receipts: upload" on storage.objects
  for insert with check (bucket_id = 'receipts');

create policy "Receipts: owner update" on storage.objects
  for update using (bucket_id = 'receipts' and owner_id::text = auth.uid()::text);

create policy "Receipts: owner delete" on storage.objects
  for delete using (bucket_id = 'receipts' and owner_id::text = auth.uid()::text);
