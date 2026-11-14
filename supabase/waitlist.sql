-- Run in the Supabase SQL editor, then set SUPABASE_URL and SUPABASE_ANON_KEY in js/config.js.
create table if not exists public.waitlist (
  id               bigint generated always as identity primary key,
  name             text not null check (char_length(name) between 1 and 100),
  email            text not null unique check (char_length(email) <= 254),
  preferred_tier   text not null check (preferred_tier in ('S', 'M', 'L')),
  deposit_interest boolean not null,
  created_at       timestamptz not null default now()
);

alter table public.waitlist enable row level security;

-- Visitors (anon key) may insert but never read, update or delete.
drop policy if exists "anon can join waitlist" on public.waitlist;
create policy "anon can join waitlist" on public.waitlist
  for insert to anon with check (true);
