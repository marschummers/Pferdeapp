import Dexie, { type EntityTable } from 'dexie';
import type {
  Caretaker,
  CareEntry,
  HealthEvent,
  Ingredient,
  Meal,
  TaskDef,
  TimeSlotDef,
  WeightEntry,
} from './types';

export const db = new Dexie('stallplaner') as Dexie & {
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

// Nur beim allerersten Erzeugen der Datenbank (nicht bei jedem App-Start) mit sinnvollen
// Standardwerten befüllen, damit direkt nutzbare Zeitfenster/Aufgaben vorhanden sind.
db.on('populate', () => {
  const defaultTimeSlots: TimeSlotDef[] = [
    { id: newId(), label: 'Morgens', order: 0 },
    { id: newId(), label: 'Mittags', order: 1 },
    { id: newId(), label: 'Abends', order: 2 },
    { id: newId(), label: 'Ganztags', order: 3 },
  ];
  const defaultTasks: TaskDef[] = [
    { id: newId(), label: 'Füttern', order: 0 },
    { id: newId(), label: 'Misten', order: 1 },
    { id: newId(), label: 'Bewegen/Reiten', order: 2 },
    { id: newId(), label: 'Wasser/Weide', order: 3 },
  ];
  db.timeSlotDefs.bulkAdd(defaultTimeSlots);
  db.taskDefs.bulkAdd(defaultTasks);
});

export function newId(): string {
  return crypto.randomUUID();
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
