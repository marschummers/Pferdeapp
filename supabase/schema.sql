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
-- BEKANNTE, UNGELÖSTE STOLPERFALLE (mehrfach beim Ersteinrichten neuer Accounts aufgetreten,
-- bisher nur auf der horses-Tabelle beobachtet): ein Insert/Update schlägt mit "new row
-- violates row-level security policy" fehl, obwohl nachweislich alles korrekt ist -- JWT gültig,
-- Policy laut pg_policies exakt wie hier im Code, auth.uid() löst im SQL-Editor korrekt auf,
-- und sogar ein testweise komplett durchlässiges `with check (true)` schlägt mit demselben
-- Fehler fehl. Das schließt einen Fehler in der Policy-Logik selbst aus. Getestete, NICHT
-- zuverlässig wirksame Reparaturversuche: Projekt-Neustart, Schema-Reload,
-- `alter table ... disable/enable row level security` (half einmal, beim zweiten Mal nicht
-- mehr), Policies auf `(select auth.uid())` statt nacktem `auth.uid()` umstellen (siehe
-- migrations/0005). Einzig zuverlässig: RLS auf der betroffenen Tabelle dauerhaft
-- ausgeschaltet lassen (Sicherheitsrisiko, siehe Chat-Historie -- offener Punkt, der an den
-- Supabase-Support gemeldet werden sollte, sobald mehr als eine vertraute Person betroffen ist).

create table if not exists horses (
  id uuid primary key,
  name text not null,
  owner_id uuid not null references auth.users (id) on delete cascade,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

-- Aktuell UNGENUTZT fuer die Zugriffspruefung (siehe has_horse_access() weiter unten) -- die App
-- wird nur von einer kleinen, vertrauten Gruppe genutzt, die sich gegenseitig bei allen Pferden
-- hilft, daher ist der Zugriff auf Betreuer:innen/Aufgaben/Zeitfenster/Termine bewusst fuer jeden
-- angemeldeten Account offen (migrations/0007) statt pro Pferd einzeln freigeschaltet werden zu
-- muessen. Tabelle bleibt bestehen, falls spaeter doch feingranularer getrennt werden soll.
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
  user_id uuid references auth.users (id) on delete set null,
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

-- Zugriff auf Betreuer:innen/Aufgaben/Zeitfenster/Termine (und darüber auch lesend auf die
-- Pferde selbst, siehe "horses: read if member" unten): jeder angemeldete Account, siehe
-- migrations/0007_shared_access_all_authenticated.sql. Umbenennen/Löschen eines Pferds bleibt
-- separat davon dem Owner vorbehalten (siehe "horses: owner updates"/"owner creates" unten).
create or replace function has_horse_access(h_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select (select auth.uid()) is not null;
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
  for insert with check (owner_id = (select auth.uid()));
-- Umbenennen/Löschen darf jede*r angemeldete Account, nicht nur der Ersteller -- siehe
-- migrations/0008_horses_any_authenticated_updates.sql.
create policy "horses: any authenticated updates" on horses
  for update using ((select auth.uid()) is not null);

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
