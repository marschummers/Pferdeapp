-- Stallplaner: fuegt weiches Loeschen fuer Pferde selbst hinzu (bisher nur bei
-- Betreuer:innen/Aufgaben/Zeitfenster/Terminen). Ermoeglicht das Loeschen ganzer Pferde in der
-- App (HorseSection.tsx), inkl. Kaskade auf deren Betreuer:innen/Aufgaben/Zeitfenster/Termine.
--
-- Einmalig zusaetzlich im Supabase SQL-Editor ausfuehren. "add column if not exists", also
-- gefahrlos mehrfach ausfuehrbar. Keine Policy-Aenderung noetig: weiches Loeschen ist ein
-- normales Update, von der bestehenden "horses: owner updates"-Policy bereits abgedeckt.

alter table horses add column if not exists deleted_at timestamptz;
