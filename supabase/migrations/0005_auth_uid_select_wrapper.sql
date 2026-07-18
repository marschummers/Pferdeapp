-- Stallplaner: ersetzt nackte auth.uid()-Aufrufe in RLS-Regeln/Funktionen durch
-- (select auth.uid()).
--
-- Hintergrund: beim Ersteinrichten trat wiederholt (bei zwei verschiedenen Accounts, jeweils
-- beim allerersten Anlegen einer horses-Zeile) "new row violates row-level security policy"
-- auf, obwohl Token/Policy/Berechtigungen nachweislich korrekt waren -- nur ein Aus-/Einschalten
-- von RLS auf der Tabelle half, und auch das nicht zuverlässig beim zweiten Mal. Ein nackter
-- auth.uid()-Aufruf in einer Policy kann in Verbindung mit Supabase/PgBouncer-Connection-Pooling
-- zu genau solchen hängenden Auswertungen führen; (select auth.uid()) zwingt Postgres, den Wert
-- sauber neu auszuwerten statt eine u.U. veraltete Auswertung wiederzuverwenden. Offizielle
-- Supabase-Empfehlung für RLS-Policies, nicht nur ein Reparaturversuch ins Blaue.
--
-- Einmalig im SQL-Editor ausführen. Danach RLS auf horses (falls gerade zum Testen ausgeschaltet)
-- wieder einschalten: alter table horses enable row level security;

create or replace function has_horse_access(h_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from horses where id = h_id and owner_id = (select auth.uid())
  ) or exists (
    select 1 from horse_members where horse_id = h_id and user_id = (select auth.uid())
  );
$$;

drop policy if exists "horses: owner creates" on horses;
create policy "horses: owner creates" on horses
  for insert with check (owner_id = (select auth.uid()));

drop policy if exists "horses: owner updates" on horses;
create policy "horses: owner updates" on horses
  for update using (owner_id = (select auth.uid()));

alter table horses enable row level security;
