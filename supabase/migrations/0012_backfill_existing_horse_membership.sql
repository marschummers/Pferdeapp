-- Stallplaner: Bestandsschutz. Vor der Zugangs-Warteliste/Pferd-per-Code-Umstellung sahen alle
-- angemeldeten Accounts automatisch alle Pferde -- damit dabei niemand etwas verliert, werden
-- alle JETZT (zum Zeitpunkt dieser Migration) existierenden Accounts bei allen JETZT
-- existierenden Pferden als Mitglied eingetragen. Betrifft nur den heutigen Stand; neue
-- Accounts/Pferde ab jetzt folgen der neuen, engeren Regel (Freigabe + Beitritt per Code).
--
-- Einmalig im Supabase SQL-Editor ausfuehren.

insert into horse_members (horse_id, user_id)
select h.id, u.id
from horses h
cross join auth.users u
where h.deleted_at is null
on conflict do nothing;
