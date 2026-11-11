-- The random link key is required to read or edit a plan. Only functions can access rows.

create table if not exists public.event_plans (
  id uuid primary key default gen_random_uuid(),
  token_digest text not null,
  version integer not null default 1 check (version > 0),
  plan jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.event_plans enable row level security;
revoke all on public.event_plans from anon, authenticated;

create or replace function public.create_event_plan(p_plan jsonb)
returns table(plan_id uuid, edit_token text, version integer)
language plpgsql security definer set search_path = pg_catalog
as $$
declare v_token text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''); v_id uuid;
begin
  if pg_column_size(p_plan) > 65536 then raise exception 'Plan too large'; end if;
  insert into public.event_plans(token_digest, plan)
  values (encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), p_plan)
  returning id into v_id;
  return query select v_id, v_token, 1;
end $$;

create or replace function public.get_event_plan(p_plan_id uuid, p_edit_token text)
returns table(plan jsonb, version integer)
language sql security definer set search_path = pg_catalog
as $$
  select ep.plan, ep.version from public.event_plans ep
  where ep.id = p_plan_id and ep.token_digest = encode(sha256(convert_to(p_edit_token, 'UTF8')), 'hex');
$$;

create or replace function public.update_event_plan(p_plan_id uuid, p_edit_token text, p_expected_version integer, p_plan jsonb)
returns table(version integer)
language plpgsql security definer set search_path = pg_catalog
as $$
begin
  if pg_column_size(p_plan) > 65536 then raise exception 'Plan too large'; end if;
  return query update public.event_plans ep
  set plan = p_plan, version = ep.version + 1, updated_at = now()
  where ep.id = p_plan_id and ep.token_digest = encode(sha256(convert_to(p_edit_token, 'UTF8')), 'hex')
    and ep.version = p_expected_version
  returning ep.version;
end $$;

revoke all on function public.create_event_plan(jsonb) from public;
revoke all on function public.get_event_plan(uuid, text) from public;
revoke all on function public.update_event_plan(uuid, text, integer, jsonb) from public;
grant execute on function public.create_event_plan(jsonb) to anon, authenticated;
grant execute on function public.get_event_plan(uuid, text) to anon, authenticated;
grant execute on function public.update_event_plan(uuid, text, integer, jsonb) to anon, authenticated;
