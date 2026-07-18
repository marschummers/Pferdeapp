-- Stallplaner: Supabase-Schema fuer den geplanten Wochenplan-Sync (Milestone 1).
--
-- Einmalig im Supabase SQL-Editor ausfuehren (Dashboard -> SQL Editor -> Query ausfuehren).
-- Die App legt hierueber noch KEINE Daten an/liest noch nichts von hier -- das kommt erst
-- in einem spaeteren Schritt (Push/Pull-Sync). Dieses Schema bereitet nur die Struktur vor.
--
-- Struktur folgt dem lokalen Dexie-Schema (siehe src/db/types.ts): pro Pferd eigene
-- Betreuer:innen/Aufgaben/Zeitfenster/Termine. Zutaten und Mahlzeiten sind bewusst NICHT
-- Teil dieses Schemas -- die bleiben laut Konzept dauerhaft lokal, siehe Memory
-- "project-supabase-sync-concept".
--
-- BEKANNTE STOLPERFALLE (beim Erst-Setup aufgetreten): Falls ein Insert/Update trotz
-- nachweislich korrekter Policy (per pg_policies geprüft, sogar mit testweise komplett
-- durchlässigem `with check (true)` reproduziert) mit "new row violates row-level security
-- policy" fehlschlägt, obwohl der JWT/auth.uid() nachweislich stimmt: das war bei uns ein
-- offenbar hängender RLS-Auswertungszustand auf Supabase-Seite, den weder ein Projekt-Neustart
-- noch ein Schema-Reload behoben haben. Geholfen hat: `alter table <tabelle> disable row level
-- security;` gefolgt von `alter table <tabelle> enable row level security;` (Policies bleiben
-- dabei erhalten, nur kurz die Tabelle dazwischen ungeschützt -- nicht mit echten Daten machen).

create table if not exists horses (
  id uuid primary key,
  name text not null,
  owner_id uuid not null references auth.users (id) on delete cascade,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Wer außer dem Owner Zugriff auf ein Pferd hat (z.B. eingeladene Freund:innen). Wird in
-- diesem Schritt noch nicht von der App befuellt -- Mitglieder vorerst manuell hier im
-- SQL-Editor eintragen (der laeuft mit vollen Rechten, umgeht also die RLS-Policies unten).
create table if not exists horse_members (
  horse_id uuid not null references horses (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  primary key (horse_id, user_id)
);

create table if not exists caretakers (
  id uuid primary key,
  horse_id uuid not null references horses (id) on delete cascade,
  name text not null,
  color text not null,
  updated_at timestamptz not null default now()
);

create table if not exists task_defs (
  id uuid primary key,
  horse_id uuid not null references horses (id) on delete cascade,
  label text not null,
  "order" integer not null,
  updated_at timestamptz not null default now()
);

create table if not exists time_slot_defs (
  id uuid primary key,
  horse_id uuid not null references horses (id) on delete cascade,
  label text not null,
  "order" integer not null,
  updated_at timestamptz not null default now()
);

create table if not exists care_entries (
  id uuid primary key,
  horse_id uuid not null references horses (id) on delete cascade,
  date_str text not null,
  time_slot_id uuid not null,
  caretaker_id uuid not null,
  tasks jsonb not null default '[]',
  note text,
  meal_id uuid,
  updated_at timestamptz not null default now()
);

-- Zugriff: wer Owner des Pferdes ist oder als Mitglied eingetragen ist.
create or replace function has_horse_access(h_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from horses where id = h_id and owner_id = auth.uid()
  ) or exists (
    select 1 from horse_members where horse_id = h_id and user_id = auth.uid()
  );
$$;

alter table horses enable row level security;
alter table horse_members enable row level security;
alter table caretakers enable row level security;
alter table task_defs enable row level security;
alter table time_slot_defs enable row level security;
alter table care_entries enable row level security;

create policy "horses: read if member" on horses
  for select using (has_horse_access(id));
create policy "horses: owner creates" on horses
  for insert with check (owner_id = auth.uid());
create policy "horses: owner updates" on horses
  for update using (owner_id = auth.uid());

create policy "horse_members: read if member" on horse_members
  for select using (has_horse_access(horse_id));

create policy "caretakers: rw if member" on caretakers
  for all using (has_horse_access(horse_id)) with check (has_horse_access(horse_id));
create policy "task_defs: rw if member" on task_defs
  for all using (has_horse_access(horse_id)) with check (has_horse_access(horse_id));
create policy "time_slot_defs: rw if member" on time_slot_defs
  for all using (has_horse_access(horse_id)) with check (has_horse_access(horse_id));
create policy "care_entries: rw if member" on care_entries
  for all using (has_horse_access(horse_id)) with check (has_horse_access(horse_id));
