-- Stallplaner: loest die "jeder angemeldete Account darf jedes Pferd umbenennen/loeschen"-Regel
-- aus migrations/0008 wieder ab. Mit der Zugangs-Warteliste (migrations/0009) und dem
-- Beitritt per Code (migrations/0011) gilt "jede*r" wieder als "jedes Mitglied DIESES Pferdes",
-- nicht mehr als "jeder x-beliebige Account im System".
--
-- Einmalig im Supabase SQL-Editor ausfuehren.

drop policy if exists "horses: any authenticated updates" on horses;
drop policy if exists "horses: member updates" on horses;

create policy "horses: member updates" on horses
  for update using (has_horse_access(id));
