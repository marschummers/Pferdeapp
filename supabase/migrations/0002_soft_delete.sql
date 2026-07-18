-- Stallplaner: fuegt weiches Loeschen hinzu (Milestone 2: Sync).
--
-- Einmalig zusaetzlich im Supabase SQL-Editor ausfuehren, NACH schema.sql. Nutzt
-- "add column if not exists", kann also gefahrlos mehrfach ausgefuehrt werden.
--
-- Statt geloeschte Zeilen wirklich zu entfernen, setzt die App ab jetzt nur noch
-- deleted_at -- das laeuft dann als ganz normales Feld durch denselben
-- Last-Write-Wins-Merge mit und macht eine separate Tombstone-Tabelle unnoetig.
-- Die bestehenden "rw if member"-Policies aus schema.sql decken das als normales
-- Update bereits ab, hier ist keine Policy-Aenderung noetig.

alter table caretakers add column if not exists deleted_at timestamptz;
alter table task_defs add column if not exists deleted_at timestamptz;
alter table time_slot_defs add column if not exists deleted_at timestamptz;
alter table care_entries add column if not exists deleted_at timestamptz;
