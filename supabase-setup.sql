-- Ejecuta este archivo una sola vez en Supabase > SQL Editor.
-- La aplicación guarda todo su estado en UNA fila JSON de esta única tabla.
-- Las tablas visibles, columnas, fórmulas y configuraciones siguen gestionadas
-- exclusivamente por script.js.

create table if not exists public.app_state (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.app_state enable row level security;

-- Esta política permite leer y guardar únicamente el documento usado por esta app.
-- Para una aplicación pública con datos privados, sustituye esta política por una
-- basada en auth.uid() antes de publicar.
drop policy if exists "public_access_to_budget_document" on public.app_state;
drop policy if exists "authenticated_access_to_budget_document" on public.app_state;
create policy "authenticated_access_to_budget_document"
on public.app_state
for all
to authenticated
using (id = 'presupuesto-mensual')
with check (id = 'presupuesto-mensual');

revoke all on public.app_state from anon;
grant select, insert, update on public.app_state to authenticated;

-- Un perfil por usuario. Los usuarios se crean desde Authentication > Users.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role text not null default 'miembro',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
drop policy if exists "users_can_read_own_profile" on public.profiles;
create policy "users_can_read_own_profile"
on public.profiles for select to authenticated
using (auth.uid() = id);
grant select on public.profiles to authenticated;

-- Perfiles visibles para el selector de menciones.
alter table public.profiles add column if not exists avatar_url text;
drop policy if exists "users_can_read_own_profile" on public.profiles;
drop policy if exists "authenticated_users_can_read_profiles" on public.profiles;
create policy "authenticated_users_can_read_profiles" on public.profiles for select to authenticated using (true);
drop policy if exists "users_update_own_profile" on public.profiles;
create policy "users_update_own_profile" on public.profiles for update to authenticated using(auth.uid()=id) with check(auth.uid()=id);
grant select,update on public.profiles to authenticated;

insert into public.profiles (id,display_name)
select id,coalesce(raw_user_meta_data->>'full_name',split_part(email,'@',1),'Usuario') from auth.users
on conflict (id) do nothing;

create or replace function public.create_profile_for_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into public.profiles(id,display_name) values(new.id,coalesce(new.raw_user_meta_data->>'full_name',split_part(new.email,'@',1),'Usuario')) on conflict(id) do nothing;
 return new;
end; $$;
drop trigger if exists create_profile_after_signup on auth.users;
create trigger create_profile_after_signup after insert on auth.users for each row execute function public.create_profile_for_new_user();

create table if not exists public.notifications (
 id bigint generated always as identity primary key,
 recipient_id uuid not null references public.profiles(id) on delete cascade,
 actor_id uuid not null references public.profiles(id) on delete cascade,
 context_title text not null,page_title text not null,page_id text,read_at timestamptz,created_at timestamptz not null default now()
);
alter table public.notifications add column if not exists archived_at timestamptz;
alter table public.notifications add column if not exists source_key text;
alter table public.notifications add column if not exists notification_type text not null default 'mention';
alter table public.notifications add column if not exists message text;
alter table public.notifications enable row level security;
drop policy if exists "users_read_own_notifications" on public.notifications;
drop policy if exists "users_create_mentions" on public.notifications;
drop policy if exists "users_mark_own_notifications" on public.notifications;
drop policy if exists "users_delete_own_mentions" on public.notifications;
create policy "users_read_own_notifications" on public.notifications for select to authenticated using(true);
create policy "users_create_mentions" on public.notifications for insert to authenticated with check(auth.uid()=actor_id and recipient_id<>auth.uid());
create policy "users_mark_own_notifications" on public.notifications for update to authenticated using(auth.uid()=recipient_id) with check(auth.uid()=recipient_id);
create policy "users_delete_own_mentions" on public.notifications for delete to authenticated using(auth.uid()=actor_id);
grant select,insert,update,delete on public.notifications to authenticated;
grant usage,select on sequence public.notifications_id_seq to authenticated;

-- Chat general del equipo. Los mensajes se conservan en Supabase y las
-- inserciones se transmiten en tiempo real a todos los usuarios autenticados.
create table if not exists public.chat_messages (
 id bigint generated always as identity primary key,
 user_id uuid not null references public.profiles(id) on delete cascade,
 message text not null check (char_length(trim(message)) between 1 and 2000),
 created_at timestamptz not null default now()
);

alter table public.chat_messages enable row level security;
drop policy if exists "authenticated_users_read_team_chat" on public.chat_messages;
drop policy if exists "users_send_own_team_messages" on public.chat_messages;
create policy "authenticated_users_read_team_chat"
on public.chat_messages for select to authenticated using (true);
create policy "users_send_own_team_messages"
on public.chat_messages for insert to authenticated with check (auth.uid() = user_id);
grant select,insert on public.chat_messages to authenticated;
grant usage,select on sequence public.chat_messages_id_seq to authenticated;

-- Estado temporal de escritura por usuario. Sirve como respaldo de Broadcast
-- y Presence cuando un navegador pierde algún evento de la conexión Realtime.
create table if not exists public.chat_typing (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 is_typing boolean not null default false,
 updated_at timestamptz not null default now()
);

alter table public.chat_typing enable row level security;
drop policy if exists "authenticated_users_read_chat_typing" on public.chat_typing;
drop policy if exists "users_manage_own_chat_typing" on public.chat_typing;
create policy "authenticated_users_read_chat_typing"
on public.chat_typing for select to authenticated using (true);
create policy "users_manage_own_chat_typing"
on public.chat_typing for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
grant select,insert,update on public.chat_typing to authenticated;

-- Último momento en que cada usuario abrió el chat.
create table if not exists public.chat_reads (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 last_read_at timestamptz not null default now()
);

alter table public.chat_reads enable row level security;
drop policy if exists "users_manage_own_chat_read" on public.chat_reads;
create policy "users_manage_own_chat_read"
on public.chat_reads for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
grant select,insert,update on public.chat_reads to authenticated;

-- Activa Postgres Changes para recibir mensajes nuevos sin recargar la página.
do $$
begin
 if not exists (
  select 1 from pg_publication_tables
  where pubname = 'supabase_realtime'
   and schemaname = 'public'
   and tablename = 'chat_messages'
 ) then
  alter publication supabase_realtime add table public.chat_messages;
 end if;
end $$;
