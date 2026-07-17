import Dexie, { type EntityTable } from 'dexie';
import type { Caretaker, CareEntry, Ingredient, Meal, TaskDef, TimeSlotDef } from './types';

export const db = new Dexie('stallplaner') as Dexie & {
  caretakers: EntityTable<Caretaker, 'id'>;
  careEntries: EntityTable<CareEntry, 'id'>;
  taskDefs: EntityTable<TaskDef, 'id'>;
  timeSlotDefs: EntityTable<TimeSlotDef, 'id'>;
  ingredients: EntityTable<Ingredient, 'id'>;
  meals: EntityTable<Meal, 'id'>;
};

db.version(1).stores({
  caretakers: 'id, name',
  careEntries: 'id, dateStr, caretakerId, timeSlotId',
  taskDefs: 'id, order',
  timeSlotDefs: 'id, order',
  ingredients: 'id, name',
  meals: 'id, name',
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
