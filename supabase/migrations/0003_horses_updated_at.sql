-- Stallplaner: fehlende updated_at-Spalte auf horses nachtragen (Fehler im urspruenglichen
-- schema.sql -- dort war nur created_at vorgesehen, aber der Sync/Last-Write-Wins-Merge in
-- lib/sync.ts braucht updated_at auch fuer die horses-Tabelle selbst).
--
-- Einmalig zusaetzlich im Supabase SQL-Editor ausfuehren. "add column if not exists", also
-- gefahrlos mehrfach ausfuehrbar.

alter table horses add column if not exists updated_at timestamptz not null default now();
