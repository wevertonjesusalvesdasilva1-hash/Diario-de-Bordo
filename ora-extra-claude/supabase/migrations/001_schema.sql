-- Hora Extra Claude: schema normalizado + RLS por papel
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'leader' check (role in ('leader','manager','admin')),
  leader_name text,
  created_at timestamptz default now()
);

create table if not exists public.employees (
  chapa text primary key,
  nome text not null,
  lider text,
  gestor text
);

create table if not exists public.shifts (
  id text primary key,            -- data_sort_key|local
  data date not null,
  local text,
  cc text
);

create table if not exists public.assignments (
  id text primary key,
  shift_id text references public.shifts(id) on delete cascade,
  chapa text references public.employees(chapa),
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
create index if not exists assignments_lider_idx on public.assignments(lider);
create index if not exists assignments_shift_idx on public.assignments(shift_id);

create table if not exists public.timeline_events (
  id text primary key,
  assignment_id text not null references public.assignments(id) on delete cascade,
  hora text not null,
  tipo text,
  descricao text not null,
  created_at timestamptz default now()
);
create index if not exists timeline_assignment_idx on public.timeline_events(assignment_id);

create table if not exists public.reallocations (
  id text primary key,
  from_assignment_id text not null references public.assignments(id) on delete cascade,
  to_assignment_id text references public.assignments(id) on delete set null,
  hora text,
  motivo text,
  entregue boolean default false,
  created_at timestamptz default now()
);

-- Cria profile automaticamente no cadastro
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, email) values (new.id, new.email) on conflict do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;
create or replace function public.my_leader() returns text
language sql stable security definer set search_path = public as $$
  select leader_name from public.profiles where id = auth.uid()
$$;

alter table public.profiles enable row level security;
alter table public.employees enable row level security;
alter table public.shifts enable row level security;
alter table public.assignments enable row level security;
alter table public.timeline_events enable row level security;
alter table public.reallocations enable row level security;

create policy "profile self" on public.profiles for select using (id = auth.uid() or my_role() in ('manager','admin'));
create policy "profile admin update" on public.profiles for update using (my_role() = 'admin');

create policy "employees read" on public.employees for select to authenticated using (true);
create policy "employees write" on public.employees for all to authenticated
  using (my_role() in ('manager','admin','leader')) with check (my_role() in ('manager','admin','leader'));
create policy "shifts read" on public.shifts for select to authenticated using (true);
create policy "shifts write" on public.shifts for all to authenticated
  using (my_role() in ('manager','admin','leader')) with check (my_role() in ('manager','admin','leader'));

-- líder só vê/edita a própria equipe; gerente/admin veem tudo
create policy "assignments scope" on public.assignments for all to authenticated
  using (my_role() in ('manager','admin') or lider = my_leader())
  with check (my_role() in ('manager','admin') or lider = my_leader());

create policy "timeline scope" on public.timeline_events for all to authenticated
  using (exists (select 1 from public.assignments a where a.id = assignment_id))
  with check (exists (select 1 from public.assignments a where a.id = assignment_id));
create policy "realloc scope" on public.reallocations for all to authenticated
  using (exists (select 1 from public.assignments a where a.id = from_assignment_id))
  with check (exists (select 1 from public.assignments a where a.id = from_assignment_id));

alter publication supabase_realtime add table public.assignments, public.timeline_events;
