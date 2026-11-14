-- Users / Portfolio / Communities tables for a production backend (the demo uses js/db.js in memory).
-- Users hold personal data (date of birth): no anon access. Read/write them from a server with the
-- service-role key, or add per-user policies once real auth exists.

create table if not exists public.communities (
  id            text primary key check (id ~ '^[a-z0-9-]{2,40}$'),
  risk_level    smallint not null check (risk_level between 1 and 5),   -- 1 very low … 5 very high
  location      text not null check (char_length(location) between 2 and 120),
  amenities     text[] not null check (cardinality(amenities) > 0),
  safety_level  smallint not null check (safety_level between 1 and 5)  -- 1 low … 5 excellent
);

create table if not exists public.portfolio (
  id            text primary key,
  tier_type     text not null check (tier_type in ('S', 'M', 'L')),
  community_id  text not null references public.communities (id) on delete restrict
);

create table if not exists public.users (
  id             text primary key,
  first_name     text not null check (char_length(first_name) between 1 and 50),
  last_name      text not null check (char_length(last_name) between 1 and 50),
  date_of_birth  date not null check (date_of_birth <= current_date - interval '18 years'),
  shares         integer not null default 0 check (shares >= 0),
  property_id    text unique references public.portfolio (id) on delete restrict  -- one occupant per home
);

create index if not exists portfolio_community_idx on public.portfolio (community_id);

alter table public.communities enable row level security;
alter table public.portfolio   enable row level security;
alter table public.users       enable row level security;

-- Communities and homes are public listing data.
drop policy if exists "public read communities" on public.communities;
create policy "public read communities" on public.communities for select to anon using (true);
drop policy if exists "public read portfolio" on public.portfolio;
create policy "public read portfolio" on public.portfolio for select to anon using (true);
-- No anon policy on users: personal data stays private.
