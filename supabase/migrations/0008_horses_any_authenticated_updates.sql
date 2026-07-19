-- Stallplaner: Umbenennen/Löschen eines Pferds für JEDEN angemeldeten Account erlauben, nicht
-- mehr nur für den ursprünglichen Ersteller (owner_id). Konsistent mit migrations/0007, das
-- Betreuer:innen/Aufgaben/Zeitfenster/Termine schon für die ganze (kleine, vertraute) Gruppe
-- geöffnet hat -- jetzt auch das Pferd selbst.
--
-- owner_id bleibt als Spalte/Konzept bestehen (u.a. für die "eigenes Pferd zuerst"-Sortierung im
-- HorseSwitcher) und wird beim Insert weiterhin auf den erstellenden Account gesetzt, aber nicht
-- mehr als Schreibschutz für spätere Änderungen verwendet.
--
-- Einmalig zusaetzlich im Supabase SQL-Editor ausfuehren.

drop policy if exists "horses: owner updates" on horses;

create policy "horses: any authenticated updates" on horses
  for update using ((select auth.uid()) is not null);
