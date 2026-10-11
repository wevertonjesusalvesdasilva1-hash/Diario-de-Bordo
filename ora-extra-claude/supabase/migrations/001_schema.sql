-- Hora Extra Claude: schema normalizado + RLS por papel
create table if not exists public.he_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'leader' check (role in ('leader','manager','admin')),
  leader_name text,
  created_at timestamptz default now()
);

create table if not exists public.he_employees (
  chapa text primary key,
  nome text not null,
  lider text,
  gestor text
);

create table if not exists public.he_shifts (
  id text primary key,            -- data_sort_key|local
  data date not null,
  local text,
  cc text
);

create table if not exists public.he_assignments (
  id text primary key,
  shift_id text references public.he_shifts(id) on delete cascade,
  chapa text references public.he_employees(chapa),
  lider text,
  peca text,
  de text, ate text,
  presenca text not null default 'Pendente',
  status_operacional text not null default 'Aguardando início',
  qty_planned numeric default 0,
  qty_actual numeric default 0,
  payload jsonb not null default '{}'::jsonb,  -- demais campos do registro
  updated_at timestamptz not null default now()
);
create index if not exists assignments_lider_idx on public.he_assignments(lider);
create index if not exists assignments_shift_idx on public.he_assignments(shift_id);

create table if not exists public.he_timeline_events (
  id text primary key,
  assignment_id text not null references public.he_assignments(id) on delete cascade,
  hora text not null,
  tipo text,
  descricao text not null,
  created_at timestamptz default now()
);
create index if not exists timeline_assignment_idx on public.he_timeline_events(assignment_id);

create table if not exists public.he_reallocations (
  id text primary key,
  from_assignment_id text not null references public.he_assignments(id) on delete cascade,
  to_assignment_id text references public.he_assignments(id) on delete set null,
  hora text,
  motivo text,
  entregue boolean default false,
  created_at timestamptz default now()
);

-- Cria o profile no 1º login (1º usuário vira admin). Sem trigger em auth.users.
create or replace function public.he_ensure_profile() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  insert into public.he_profiles(id, email, role)
  values (auth.uid(), (select email from auth.users where id = auth.uid()),
          case when exists (select 1 from public.he_profiles) then 'leader' else 'admin' end)
  on conflict (id) do nothing;
end $$;
revoke execute on function public.he_ensure_profile() from public, anon;
grant execute on function public.he_ensure_profile() to authenticated;

create or replace function public.he_my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.he_profiles where id = auth.uid()
$$;
create or replace function public.he_my_leader() returns text
language sql stable security definer set search_path = public as $$
  select leader_name from public.he_profiles where id = auth.uid()
$$;

alter table public.he_profiles enable row level security;
alter table public.he_employees enable row level security;
alter table public.he_shifts enable row level security;
alter table public.he_assignments enable row level security;
alter table public.he_timeline_events enable row level security;
alter table public.he_reallocations enable row level security;

create policy "he_profile read" on public.he_profiles for select to authenticated using (id = auth.uid() or he_my_role() in ('manager','admin'));
create policy "he_profile admin update" on public.he_profiles for update to authenticated using (he_my_role() = 'admin');

create policy "he_employees read" on public.he_employees for select to authenticated using (true);
create policy "he_employees write" on public.he_employees for all to authenticated
  using (he_my_role() in ('manager','admin','leader')) with check (he_my_role() in ('manager','admin','leader'));
create policy "he_shifts read" on public.he_shifts for select to authenticated using (true);
create policy "he_shifts write" on public.he_shifts for all to authenticated
  using (he_my_role() in ('manager','admin','leader')) with check (he_my_role() in ('manager','admin','leader'));

revoke execute on function public.he_my_role(), public.he_my_leader() from public, anon;
grant execute on function public.he_my_role(), public.he_my_leader() to authenticated;

-- líder só vê/edita a própria equipe; gerente/admin veem tudo
create policy "he_assignments scope" on public.he_assignments for all to authenticated
  using (he_my_role() in ('manager','admin') or lider = he_my_leader())
  with check (he_my_role() in ('manager','admin') or lider = he_my_leader());

create policy "timeline scope" on public.he_timeline_events for all to authenticated
  using (exists (select 1 from public.he_assignments a where a.id = assignment_id))
  with check (exists (select 1 from public.he_assignments a where a.id = assignment_id));
create policy "realloc scope" on public.he_reallocations for all to authenticated
  using (exists (select 1 from public.he_assignments a where a.id = from_assignment_id))
  with check (exists (select 1 from public.he_assignments a where a.id = from_assignment_id));

alter publication supabase_realtime add table public.he_assignments, public.he_timeline_events;

