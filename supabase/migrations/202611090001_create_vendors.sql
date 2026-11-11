create table if not exists public.vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  borough text,
  description text,
  website_url text,
  contact_email text,
  price_min numeric check (price_min is null or price_min >= 0),
  price_max numeric check (price_max is null or price_max >= 0),
  capacity_min integer check (capacity_min is null or capacity_min > 0),
  capacity_max integer check (capacity_max is null or capacity_max > 0),
  rating numeric check (rating is null or rating between 0 and 5),
  review_count integer not null default 0 check (review_count >= 0),
  review_summary text,
  source_url text,
  is_synthetic boolean not null default true,
  created_at timestamptz not null default now(),
  constraint vendors_price_range check (
    price_min is null or price_max is null or price_min <= price_max
  ),
  constraint vendors_capacity_range check (
    capacity_min is null or capacity_max is null or capacity_min <= capacity_max
  )
);

alter table public.vendors enable row level security;

drop policy if exists "Public can read vendors" on public.vendors;
create policy "Public can read vendors"
on public.vendors
for select
to anon, authenticated
using (true);
