import Dexie, { type EntityTable } from 'dexie';
import type {
  Caretaker,
  CareEntry,
  HealthEvent,
  Horse,
  Ingredient,
  Meal,
  TaskDef,
  TimeSlotDef,
  WeightEntry,
} from './types';

export const db = new Dexie('stallplaner') as Dexie & {
  horses: EntityTable<Horse, 'id'>;
  caretakers: EntityTable<Caretaker, 'id'>;
  careEntries: EntityTable<CareEntry, 'id'>;
  taskDefs: EntityTable<TaskDef, 'id'>;
  timeSlotDefs: EntityTable<TimeSlotDef, 'id'>;
  ingredients: EntityTable<Ingredient, 'id'>;
  meals: EntityTable<Meal, 'id'>;
  weightEntries: EntityTable<WeightEntry, 'id'>;
  healthEvents: EntityTable<HealthEvent, 'id'>;
};

db.version(1).stores({
  caretakers: 'id, name',
  careEntries: 'id, dateStr, caretakerId, timeSlotId',
  taskDefs: 'id, order',
  timeSlotDefs: 'id, order',
  ingredients: 'id, name',
  meals: 'id, name',
  weightEntries: 'id, dateStr',
  healthEvents: 'id, category, dateStr, nextDueDateStr',
});

// Führt das Konzept "Pferd" ein (Grundlage für den geplanten Mehrbenutzer-Sync über
// Supabase): Betreuer:innen, Aufgaben, Zeitfenster und Termine gehören jetzt zu einem
// Pferd (horseId) und tragen ein updatedAt fürs spätere Last-Write-Wins beim Sync.
// Bestehende lokale Daten werden einem automatisch angelegten Standard-Pferd zugeordnet,
// damit beim Update nichts verloren geht.
db.version(2)
  .stores({
    horses: 'id, name',
    caretakers: 'id, horseId, name',
    careEntries: 'id, horseId, dateStr, caretakerId, timeSlotId',
    taskDefs: 'id, horseId, order',
    timeSlotDefs: 'id, horseId, order',
  })
  .upgrade(async (tx) => {
    const horseId = newId();
    const now = Date.now();
    await tx.table('horses').add({ id: horseId, name: 'Mein Pferd', updatedAt: now });
    for (const tableName of ['caretakers', 'careEntries', 'taskDefs', 'timeSlotDefs']) {
      await tx
        .table(tableName)
        .toCollection()
        .modify((row) => {
          row.horseId = horseId;
          row.updatedAt = now;
        });
    }
  });

// Backfillt `updatedAt` auf Pferde-Zeilen, die noch aus der Zeit vor diesem Feld stammen:
// wer die App schon vor der Sync-Vorbereitung genutzt hat, durchlief das obige version(2)-
// Upgrade, als dessen Code sein Pferd noch ohne updatedAt anlegte. Dexie führt ein einmal
// erreichtes Versions-Upgrade nie erneut aus (auch nicht, wenn sich dessen Code später ändert
// wie hier), daher ein eigener, neuer Versionsschritt statt version(2) nachträglich zu ändern.
// Ohne das schlägt der Supabase-Sync mit "Invalid time value" fehl (new Date(undefined)).
db.version(3).upgrade(async (tx) => {
  const now = Date.now();
  await tx
    .table('horses')
    .toCollection()
    .modify((h) => {
      if (h.updatedAt === undefined) h.updatedAt = now;
    });
});

// Nur beim allerersten Erzeugen der Datenbank (nicht bei jedem App-Start) mit sinnvollen
// Standardwerten befüllen, damit direkt nutzbare Zeitfenster/Aufgaben vorhanden sind.
// Läuft für Neuinstallationen direkt auf der aktuellen Version (nicht über .upgrade()).
db.on('populate', () => {
  const horseId = newId();
  const now = Date.now();
  db.horses.add({ id: horseId, name: 'Mein Pferd', updatedAt: now });

  const defaultTimeSlots: TimeSlotDef[] = [
    { id: newId(), horseId, label: 'Morgens', order: 0, updatedAt: now },
    { id: newId(), horseId, label: 'Mittags', order: 1, updatedAt: now },
    { id: newId(), horseId, label: 'Abends', order: 2, updatedAt: now },
    { id: newId(), horseId, label: 'Ganztags', order: 3, updatedAt: now },
  ];
  const defaultTasks: TaskDef[] = [
    { id: newId(), horseId, label: 'Füttern', order: 0, updatedAt: now },
    { id: newId(), horseId, label: 'Misten', order: 1, updatedAt: now },
    { id: newId(), horseId, label: 'Bewegen/Reiten', order: 2, updatedAt: now },
    { id: newId(), horseId, label: 'Wasser/Weide', order: 3, updatedAt: now },
  ];
  db.timeSlotDefs.bulkAdd(defaultTimeSlots);
  db.taskDefs.bulkAdd(defaultTasks);
});

export function newId(): string {
  return crypto.randomUUID();
}

// Exportiert (statt nur modul-intern), damit src/lib/activeHorse.tsx denselben Key liest/
// schreibt wie die Funktionen hier – Umschalten im UI und Anlegen neuer Zeilen (die weiterhin
// über getCurrentHorseId laufen) müssen immer auf demselben aktiven Pferd landen.
export const CURRENT_HORSE_ID_KEY = 'stallplaner-current-horse-id';

// Liefert die id des aktuell aktiven Pferds (das, dessen Wochenplan/Betreuer:innen/Aufgaben/
// Zeitfenster gerade angezeigt werden bzw. in das neue Zeilen einsortiert werden). Bewusst
// async statt rein synchron über localStorage gelöst, damit kein Aufruf vor Abschluss von
// populate/upgrade ins Leere laufen kann: Dexie stellt sicher, dass diese Abfrage erst
// aufgelöst wird, nachdem die Datenbank vollständig geöffnet ist.
//
// Das Ergebnis wird in localStorage gemerkt und beim Umschalten über setCurrentHorseId (siehe
// src/lib/activeHorse.tsx, dort als setActiveHorseId genutzt) aktualisiert – ohne explizite
// Auswahl fällt es auf das erste bekannte Pferd zurück, sobald über Supabase-Sync mehr als eins
// lokal existiert (jeder angemeldete Account sieht alle Pferde, siehe schema.sql).
export async function getCurrentHorseId(): Promise<string> {
  const cached = localStorage.getItem(CURRENT_HORSE_ID_KEY);
  if (cached) return cached;
  const horse = await db.horses.toCollection().first();
  if (!horse) throw new Error('Kein Pferd vorhanden');
  localStorage.setItem(CURRENT_HORSE_ID_KEY, horse.id);
  return horse.id;
}

export function setCurrentHorseId(horseId: string): void {
  localStorage.setItem(CURRENT_HORSE_ID_KEY, horseId);
}

// Legt einen Gewichts-Eintrag für einen Tag an oder überschreibt den bestehenden
// (ein Eintrag pro Kalendertag).
export async function upsertWeightEntry(dateStr: string, weightKg: number) {
  const existing = await db.weightEntries.where('dateStr').equals(dateStr).first();
  if (existing) {
    await db.weightEntries.update(existing.id, { weightKg });
  } else {
    await db.weightEntries.add({ id: newId(), dateStr, weightKg });
  }
}
