-- Stallplaner: Zugangs-Warteliste. Ab jetzt bekommt niemand mehr automatisch Zugriff nur durch
-- Anmelden -- ein neuer Account landet zunaechst als "nicht freigegeben" in profiles und sieht
-- (via has_horse_access weiter unten) so lange gar nichts, bis der Admin (siehe E-Mail-Check
-- unten) ihn manuell freigibt.
--
-- Einmalig im Supabase SQL-Editor ausfuehren.

create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  approved boolean not null default false,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

-- Standard-Supabase-Muster: legt bei jedem neuen auth.users-Eintrag automatisch eine
-- profiles-Zeile an (approved defaultet auf false).
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profiles (id, email) values (new.id, new.email);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- drop/create statt "if not exists" (Postgres kennt kein "create policy if not exists") --
-- macht die Datei gefahrlos mehrfach ausfuehrbar, falls sie schon einmal teilweise durchlief.
drop policy if exists "profiles: read own" on profiles;
drop policy if exists "profiles: admin reads all" on profiles;
drop policy if exists "profiles: admin approves" on profiles;

-- Jede*r darf die eigene Zeile lesen (fuer den "Warte auf Freigabe"-Bildschirm in der App).
create policy "profiles: read own" on profiles
  for select using (id = (select auth.uid()));

-- Nur der Admin (feste E-Mail-Adresse) darf alle Profile sehen (Warteliste) und den
-- approved-Status setzen. Kein separates Rollen-System noetig fuer eine einzelne Person.
create policy "profiles: admin reads all" on profiles
  for select using ((select auth.jwt() ->> 'email') = 'marschummers@googlemail.com');
create policy "profiles: admin approves" on profiles
  for update using ((select auth.jwt() ->> 'email') = 'marschummers@googlemail.com');

-- Bestandsschutz: alle aktuell existierenden Accounts (vor Einfuehrung der Warteliste) gelten
-- schon als freigegeben, damit niemand ausgesperrt wird.
insert into profiles (id, email, approved)
select id, email, true from auth.users
on conflict (id) do update set approved = true;

-- has_horse_access() um die Freigabe-Pruefung erweitert: ohne approved = true kein Zugriff auf
-- irgendeine Pferde-bezogene Tabelle, unabhaengig von Besitz/Mitgliedschaft.
create or replace function has_horse_access(h_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select
    exists (select 1 from profiles where id = (select auth.uid()) and approved = true)
    and (
      exists (select 1 from horses where id = h_id and owner_id = (select auth.uid()))
      or exists (select 1 from horse_members where horse_id = h_id and user_id = (select auth.uid()))
    );
$$;
