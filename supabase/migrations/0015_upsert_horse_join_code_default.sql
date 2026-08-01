-- Stallplaner: upsert_horse() bekommt einen Standardwert fuer p_join_code. Bei Pferden, die vor
-- Einfuehrung des Beitritts-Codes bereits synchronisiert waren, kennt das Geraet den Code lokal
-- noch nicht (kommt erst beim naechsten Pull) -- wird so ein Pferd vorher schon mal per Push
-- geschickt, fehlt der Parameter im RPC-Aufruf komplett (JS liefert `undefined` statt `null`,
-- das faellt beim Verschicken einfach weg). Ohne Standardwert findet PostgREST dann keine
-- passende Funktions-Signatur mehr ("Could not find the function ... in the schema cache").
--
-- Einmalig im Supabase SQL-Editor ausfuehren.

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
    if not has_horse_access(p_id) then
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
    values (p_id, p_name, auth.uid(), p_updated_at, p_deleted_at, coalesce(p_join_code, upper(substr(md5(random()::text || p_id::text), 1, 6))));
  end if;
end;
$$;
