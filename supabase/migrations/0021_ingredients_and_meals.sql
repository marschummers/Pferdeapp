-- Stallplaner: Mahlzeit-Rezepte werden pferdeweise synchronisiert, damit eine Betreuerin eines
-- fremden Pferds (z.B. über einen ihr zugewiesenen Termin) das dortige Rezept lesen kann, ohne
-- vor Ort nachzufragen. Zutaten werden dafür nur TEILWEISE mitsynchronisiert (Name/Einheit/
-- Hersteller) -- absichtlich OHNE Bestand/Vorrat-Spalten, der bleibt pro Stall/Gerät lokal
-- (siehe src/lib/stock.ts, src/db/types.ts). Ersetzt die bisherige Aussage in schema.sql, dass
-- Zutaten/Mahlzeiten grundsätzlich nicht Teil des Sync sind.
--
-- Einmalig im Supabase SQL-Editor ausfuehren.

create table if not exists ingredients (
  id uuid primary key,
  horse_id uuid not null references horses (id) on delete cascade,
  name text not null,
  unit text not null,
  manufacturer text,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists meals (
  id uuid primary key,
  horse_id uuid not null references horses (id) on delete cascade,
  name text not null,
  ingredients jsonb not null default '[]',
  prep_steps jsonb not null default '[]',
  tip text,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table ingredients enable row level security;
alter table meals enable row level security;

drop policy if exists "ingredients: rw if member" on ingredients;
create policy "ingredients: rw if member" on ingredients
  for all using (has_horse_access(horse_id)) with check (has_horse_access(horse_id));

drop policy if exists "meals: rw if member" on meals;
create policy "meals: rw if member" on meals
  for all using (has_horse_access(horse_id)) with check (has_horse_access(horse_id));
