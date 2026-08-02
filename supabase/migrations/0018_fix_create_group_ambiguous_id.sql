-- Stallplaner: create_group() gibt eine Tabelle mit Spalte "id" zurück (returns table(id uuid,
-- join_code text)) -- dieser Name kollidiert innerhalb der Funktion mit dem ungefilterten `id`
-- in der profiles-Abfrage ("column reference \"id\" is ambiguous"). Fix: profiles.id explizit
-- qualifizieren.
--
-- Einmalig im Supabase SQL-Editor ausfuehren.

create or replace function create_group(p_name text)
returns table(id uuid, join_code text)
language plpgsql
security definer
as $$
declare
  new_id uuid;
  new_code text;
begin
  if not exists (select 1 from profiles where profiles.id = auth.uid() and approved = true) then
    raise exception 'Zugang noch nicht freigegeben.';
  end if;
  new_id := gen_random_uuid();
  new_code := upper(substr(md5(random()::text || new_id::text), 1, 6));
  insert into groups (id, name, owner_id, join_code) values (new_id, p_name, auth.uid(), new_code);
  return query select new_id, new_code;
end;
$$;
