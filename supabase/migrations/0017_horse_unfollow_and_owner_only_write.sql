-- Stallplaner: "Entfolgen" statt nur "Beitreten" -- wer über einen Pferde-Code beigetreten ist
-- (oder über eine Gruppe Mitglied wurde), kann sich selbst wieder austragen, ohne dass die
-- Besitzer:in etwas tun muss. Im Gegenzug wird Umbenennen/Löschen enger gefasst: das darf ab
-- jetzt nur noch der/die Besitzer:in und der feste Admin-Account -- nicht mehr jedes Mitglied
-- (sonst könnte jemand, der nur folgt, das Pferd für alle löschen).
--
-- Einmalig im Supabase SQL-Editor ausfuehren.

-- "Entfolgen": eigene Mitgliedschaft selbst entfernen dürfen, unabhängig vom Besitzer-Recht
-- unten (das Rauswerfen ANDERER Mitglieder bleibt weiterhin der Besitzer:in vorbehalten,
-- siehe "horse_members: owner removes" aus migrations/0011).
create policy "horse_members: self removes" on horse_members
  for delete using (user_id = (select auth.uid()));

-- Umbenennen/Löschen nur noch Besitzer:in oder fester Admin-Account (nicht mehr jedes Mitglied,
-- siehe migrations/0010). Betrifft nur die Tabellen-Policy selbst -- der eigentliche
-- Schreibpfad läuft über upsert_horse() (RPC unten), diese Policy ist Verteidigung in der Tiefe.
drop policy if exists "horses: member updates" on horses;
create policy "horses: owner or admin updates" on horses
  for update using (
    owner_id = (select auth.uid())
    or (select auth.jwt() ->> 'email') = 'marschummers@googlemail.com'
  );

-- upsert_horse() entsprechend angepasst: die Zugriffsprüfung beim Aktualisieren eines
-- bestehenden Pferds prüft jetzt Besitz/Admin statt has_horse_access() (das würde weiterhin
-- jedes Mitglied durchlassen).
create or replace function upsert_horse(
  p_id uuid,
  p_name text,
  p_updated_at timestamptz,
  p_deleted_at timestamptz,
  p_join_code text default null
)
returns void
language plpgsql
security definer
as $$
begin
  if not exists (select 1 from profiles where id = auth.uid() and approved = true) then
    raise exception 'Zugang noch nicht freigegeben.';
  end if;

  if exists (select 1 from horses where id = p_id) then
    if not (
      exists (select 1 from horses where id = p_id and owner_id = auth.uid())
      or (select auth.jwt() ->> 'email') = 'marschummers@googlemail.com'
    ) then
      raise exception 'Kein Zugriff auf dieses Pferd.';
    end if;
    update horses
    set name = p_name,
        updated_at = p_updated_at,
        deleted_at = p_deleted_at,
        join_code = coalesce(p_join_code, join_code)
    where id = p_id;
  else
    insert into horses (id, name, owner_id, updated_at, deleted_at, join_code)
    values (
      p_id, p_name, auth.uid(), p_updated_at, p_deleted_at,
      coalesce(p_join_code, upper(substr(md5(random()::text || p_id::text), 1, 6)))
    );
  end if;
end;
$$;
