-- Stallplaner: Pferd per Code beitreten. Statt dass Besitzer:innen einzelne E-Mail-Adressen
-- einladen, bekommt jedes Pferd einen kurzen eindeutigen Code, den man weitergeben kann;
-- wer freigegeben ist (siehe migrations/0009) und den Code kennt, tritt darüber selbst bei.
--
-- Einmalig im Supabase SQL-Editor ausfuehren.

alter table horses add column if not exists join_code text;

update horses set join_code = upper(substr(md5(random()::text || id::text), 1, 6))
where join_code is null;

alter table horses alter column join_code set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'horses_join_code_key'
  ) then
    alter table horses add constraint horses_join_code_key unique (join_code);
  end if;
end $$;

create or replace function join_horse_by_code(code text)
returns text
language plpgsql
security definer
as $$
declare
  target_horse horses%rowtype;
begin
  if not exists (select 1 from profiles where id = auth.uid() and approved = true) then
    raise exception 'Zugang noch nicht freigegeben.';
  end if;

  select * into target_horse from horses where join_code = upper(code) and deleted_at is null;
  if not found then
    raise exception 'Ungültiger Code.';
  end if;

  insert into horse_members (horse_id, user_id)
  values (target_horse.id, auth.uid())
  on conflict do nothing;

  return target_horse.name;
end;
$$;

-- drop/create statt "if not exists" (Postgres kennt kein "create policy if not exists") --
-- macht die Datei gefahrlos mehrfach ausfuehrbar, falls sie schon einmal teilweise durchlief.
drop policy if exists "horse_members: owner removes" on horse_members;
drop policy if exists "profiles: owner reads horse members" on profiles;

-- Mitglieder entfernen darf nur der/die Besitzer:in des jeweiligen Pferds.
create policy "horse_members: owner removes" on horse_members
  for delete using (
    exists (select 1 from horses where id = horse_id and owner_id = (select auth.uid()))
  );

-- Damit die Mitglieder-Liste in der Verwaltung E-Mail-Adressen anzeigen kann: Besitzer:innen
-- duerfen zusaetzlich die Profile der Mitglieder ihrer eigenen Pferde lesen.
create policy "profiles: owner reads horse members" on profiles
  for select using (
    exists (
      select 1 from horse_members hm
      join horses h on h.id = hm.horse_id
      where hm.user_id = profiles.id and h.owner_id = (select auth.uid())
    )
  );
