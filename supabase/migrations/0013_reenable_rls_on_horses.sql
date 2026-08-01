-- Stallplaner: Row-Level-Security auf horses war seit dem sehr fruehen, damals ungeloesten
-- RLS-Bug (siehe aeltere Kommentar-Historie in schema.sql) dauerhaft deaktiviert -- alle
-- Policies auf der Tabelle waren dadurch wirkungslos, jeder angemeldete Account konnte alle
-- Pferde lesen, unabhaengig von migrations/0009-0012. Sicherheitshalber gleich auf allen
-- betroffenen Tabellen erneut aktivieren (bei bereits aktivem RLS ein harmloser No-Op).
--
-- Einmalig im Supabase SQL-Editor ausfuehren.

alter table horses enable row level security;
alter table horse_members enable row level security;
alter table caretakers enable row level security;
alter table task_defs enable row level security;
alter table time_slot_defs enable row level security;
alter table care_entries enable row level security;
alter table profiles enable row level security;

-- Zur Kontrolle: sollte jetzt ueberall "t" (true) zeigen.
select relname, relrowsecurity from pg_class
where relname in ('horses', 'horse_members', 'caretakers', 'task_defs', 'time_slot_defs', 'care_entries', 'profiles');
