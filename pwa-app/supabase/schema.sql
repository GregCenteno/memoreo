-- Memoreo — esquema de base de datos real (Supabase / Postgres)
-- ---------------------------------------------------------------
-- Reemplaza las cuentas simuladas (SHA-256 en localStorage) y los
-- documentos/adjuntos guardados en el navegador de cada quien por una
-- base de datos compartida real: Supabase Auth para las cuentas,
-- Postgres para los documentos, y Supabase Storage para las fotos/PDFs
-- adjuntos (con URLs firmadas, para que sí se puedan ver/descargar).
--
-- Cómo usarlo: Supabase → tu proyecto → SQL Editor → pega este archivo
-- completo → Run. Es seguro volver a correrlo (usa "if not exists"/
-- "or replace" donde aplica), pero está pensado para correrse UNA vez
-- sobre un proyecto nuevo.

-- =========================================================
-- 1. profiles — un renglón por cuenta, ligado 1 a 1 a auth.users
-- =========================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  plan text not null default 'gratis' check (plan in ('gratis','premium','premium_plus')),
  accent_color text not null default 'turquesa',
  avatar_path text,                    -- ruta dentro del bucket "avatars", no la imagen en sí
  payment_method jsonb,                -- {brand, last4} — nunca el número completo, eso lo guarda Stripe
  trial_ends_at timestamptz,
  trial_used boolean not null default false,
  stripe_customer_id text,
  stripe_subscription_id text,
  notification_prefs jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Cada quien solo puede ver y modificar su propio perfil.
drop policy if exists "profiles: select own" on public.profiles;
create policy "profiles: select own" on public.profiles for select using (auth.uid() = id);
drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own" on public.profiles for update using (auth.uid() = id);
drop policy if exists "profiles: insert own" on public.profiles;
create policy "profiles: insert own" on public.profiles for insert with check (auth.uid() = id);
-- No hay policy de "delete": la cuenta se elimina vía auth.admin (ver
-- netlify/functions/delete-account.mjs), que además borra el perfil por
-- el "on delete cascade" de arriba. El panel de administrador lee con la
-- service_role key, que ignora RLS por diseño — no necesita policy propia.

-- Crea el perfil automáticamente en cuanto alguien se registra en
-- Supabase Auth, tomando el nombre que mandó el formulario de registro
-- (guardado en el metadata del signUp, ver src/auth.js).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', ''));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =========================================================
-- 2. documents — un renglón por documento/registro guardado
-- =========================================================
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null,
  kind text not null default 'doc' check (kind in ('doc','activity')),
  name text not null,
  expires_at timestamptz,
  performed_at timestamptz,
  reminder_days int,
  recurrence text,               -- pagos: 'mensual' | 'bimestral' | 'anual'
  direction text,                -- préstamos: 'me_deben' | 'yo_debo'
  person text,                   -- préstamos: con quién es
  amount numeric,
  notes text,
  attachment_path text,          -- ruta dentro del bucket "attachments"
  attachment_type text check (attachment_type in ('image','pdf')),
  attachment_name text,          -- nombre original del archivo (para mostrarlo)
  health_type text,
  dose text,
  frequency text,
  lab_test_type text,
  lab_values jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists documents_user_id_idx on public.documents(user_id);
create index if not exists documents_expires_at_idx on public.documents(expires_at);

alter table public.documents enable row level security;

drop policy if exists "documents: select own" on public.documents;
create policy "documents: select own" on public.documents for select using (auth.uid() = user_id);
drop policy if exists "documents: insert own" on public.documents;
create policy "documents: insert own" on public.documents for insert with check (auth.uid() = user_id);
drop policy if exists "documents: update own" on public.documents;
create policy "documents: update own" on public.documents for update using (auth.uid() = user_id);
drop policy if exists "documents: delete own" on public.documents;
create policy "documents: delete own" on public.documents for delete using (auth.uid() = user_id);

-- Mantiene updated_at al día en cada cambio (perfiles y documentos).
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute procedure public.set_updated_at();

drop trigger if exists documents_set_updated_at on public.documents;
create trigger documents_set_updated_at before update on public.documents
  for each row execute procedure public.set_updated_at();

-- =========================================================
-- 3. Storage — buckets privados para adjuntos y fotos de perfil
-- =========================================================
insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', false)
on conflict (id) do nothing;

-- Convención de rutas: "<user_id>/<algo>" — así una sola policy por
-- bucket controla el acceso de todo el mundo: cada quien solo puede leer
-- o escribir dentro de su propia carpeta (el primer segmento de la ruta
-- debe ser su propio auth.uid()).
drop policy if exists "attachments: owner rw" on storage.objects;
create policy "attachments: owner rw" on storage.objects for all
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars: owner rw" on storage.objects;
create policy "avatars: owner rw" on storage.objects for all
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Listo. Con esto: cada cuenta nueva en Supabase Auth obtiene su
-- "profiles" automáticamente, cada quien solo puede leer/escribir sus
-- propios documentos y archivos, y el panel de administrador (que usa la
-- service_role key desde una función de servidor, nunca desde el
-- navegador) puede leer todos los perfiles sin toparse con RLS.
