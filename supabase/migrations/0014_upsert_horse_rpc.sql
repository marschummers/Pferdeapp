-- Stallplaner: Workaround für den alten, nie tatsächlich geklärten RLS-Bug auf der
-- horses-Tabelle ("new row violates row-level security policy" bei Insert/Update, obwohl JWT,
-- Policy-Text und auth.uid()-Auflösung nachweislich korrekt sind -- ausführlich untersucht,
-- siehe ältere schema.sql-Historie/Chat). Betrifft nachweislich nur direkte Schreibzugriffe über
-- PostgREST auf genau diese Tabelle; die security-definer-Funktion join_horse_by_code() (schreibt
-- in horse_members) läuft dagegen zuverlässig unter denselben RLS-Bedingungen. Route das Anlegen/
-- Ändern von Pferden deshalb über eine analoge Funktion statt über direktes .upsert().
--
-- Einmalig im Supabase SQL-Editor ausfuehren.

create or replace function upsert_horse(
  p_id uuid,
  p_name text,
  p_updated_at timestamptz,
  p_deleted_at timestamptz,
  p_join_code text
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
    if not has_horse_access(p_id) then
      raise exception 'Kein Zugriff auf dieses Pferd.';
    end if;
    -- owner_id bewusst nie hier ändern -- Besitz wechselt nie über einen normalen Sync-Push.
    update horses
    set name = p_name,
        updated_at = p_updated_at,
        deleted_at = p_deleted_at,
        join_code = coalesce(p_join_code, join_code)
    where id = p_id;
  else
    -- owner_id immer der aufrufende Account, unabhängig davon was der Client sendet.
    insert into horses (id, name, owner_id, updated_at, deleted_at, join_code)
    values (p_id, p_name, auth.uid(), p_updated_at, p_deleted_at, p_join_code);
  end if;
end;
$$;
