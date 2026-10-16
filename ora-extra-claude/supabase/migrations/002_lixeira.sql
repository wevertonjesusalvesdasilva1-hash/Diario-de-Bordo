-- FASE 1 (sem mudar o app): lixeira por trigger + histórico de alterações de presença
create table public.he_trash (id bigserial primary key, tabela text not null, linha jsonb not null, apagado_em timestamptz not null default now());
alter table public.he_trash enable row level security;      -- sem policy: anon/authenticated não leem nem escrevem
revoke all on public.he_trash from anon, authenticated;
revoke all on sequence public.he_trash_id_seq from anon, authenticated;

create function public.he_trash_row() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.he_trash(tabela, linha) values (tg_table_name || case tg_op when 'UPDATE' then ':antes' else '' end, to_jsonb(old));
  return coalesce(new, old);
end $$;
revoke execute on function public.he_trash_row() from public, anon, authenticated;

do $$ declare t text; begin
  foreach t in array array['he_assignments','he_timeline_events','he_employees','he_shifts','he_reallocations','he_settings'] loop
    execute format('create trigger %I after delete on public.%I for each row execute function public.he_trash_row()', t || '_trash', t);
  end loop;
end $$;
create trigger he_assignments_hist after update on public.he_assignments for each row
  when (old.presenca is distinct from new.presenca or old.payload is distinct from new.payload)
  execute function public.he_trash_row();

revoke truncate, references, trigger on public.he_employees, public.he_shifts, public.he_assignments, public.he_timeline_events, public.he_reallocations, public.he_settings from anon, authenticated;
