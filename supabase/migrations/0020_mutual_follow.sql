-- Stallplaner: "Folgen" wird gegenseitig. Gibt jemand seinen Pferde-Code weiter und eine andere
-- Person tritt bei, sehen sich ab sofort BEIDE gegenseitig -- ohne dass beide Seiten aktiv den
-- Code der anderen Person eingeben müssten.
--
-- Wichtig: Entfolgen bleibt trotzdem einseitig (siehe "horse_members: self removes",
-- migrations/0017). Person A folgt Person B -> beide sehen sich. Entfolgt B daraufhin A, sieht
-- B die A-Seite nicht mehr, A sieht B aber weiterhin -- jede Richtung ist eine eigene,
-- unabhängige horse_members-Zeile.
--
-- Einmalig im Supabase SQL-Editor ausfuehren.

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

  -- Ich sehe das Pferd der Person, deren Code ich eingegeben habe.
  insert into horse_members (horse_id, user_id)
  values (target_horse.id, auth.uid())
  on conflict do nothing;

  -- Gegenseitig: die andere Person sieht automatisch auch mein(e) eigene(s) Pferd(e) --
  -- bleibt trotzdem unabhängig entfolgbar (siehe Kommentar oben).
  insert into horse_members (horse_id, user_id)
  select h.id, target_horse.owner_id
  from horses h
  where h.owner_id = auth.uid() and h.deleted_at is null
  on conflict do nothing;

  return target_horse.name;
end;
$$;
