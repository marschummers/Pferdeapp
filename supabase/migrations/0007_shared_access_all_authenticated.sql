-- Stallplaner: Zugriff auf Betreuer:innen/Aufgaben/Zeitfenster/Termine (und implizit auch auf
-- die Pferde selbst) fuer JEDEN angemeldeten Account freigeben, statt pro Pferd einzeln
-- Mitgliedschaften ueber horse_members eintragen zu muessen.
--
-- Hintergrund: die App wird nur von einer kleinen, vertrauten Gruppe (~5 Personen) genutzt, die
-- sich gegenseitig bei allen Pferden hilft -- nicht von getrennten Besitzer:innen, die sich
-- gegeneinander abschotten wollen. has_horse_access() pruefte bisher Besitz ODER eine manuell
-- per SQL-Editor eingetragene horse_members-Zeile; letztere gab es aber noch nie eine
-- Oberflaeche fuer, weshalb neu hinzugefuegte Accounts (z.B. die Ehefrau) zwar das Pferd selbst
-- sahen (weil RLS auf horses aus anderen Gruenden ohnehin deaktiviert ist, siehe schema.sql),
-- aber keine Betreuer:innen/Termine dazu -- die vier anderen Tabellen haben RLS weiterhin aktiv
-- und liessen ohne Mitgliedschaft nichts durch.
--
-- Einmalig zusaetzlich im Supabase SQL-Editor ausfuehren.
--
-- horse_members bleibt als Tabelle bestehen (ungenutzt, falls spaeter doch mal feingranularer
-- pro Pferd getrennt werden soll), wird aber ab jetzt nicht mehr fuer die Zugriffspruefung
-- herangezogen. Das Umbenennen/Loeschen eines Pferds selbst bleibt bewusst weiterhin nur dem
-- Owner vorbehalten (siehe "horses: owner updates"-Policy in schema.sql) -- das hier betrifft
-- nur die Tagesgeschaeft-Daten (Betreuer:innen/Aufgaben/Zeitfenster/Termine).

create or replace function has_horse_access(h_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select (select auth.uid()) is not null;
$$;
