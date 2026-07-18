// Ein Pferd. Betreuer:innen, Aufgaben, Zeitfenster und Termine gehören jeweils zu genau einem
// Pferd; welches davon gerade aktiv angezeigt wird, steuert src/lib/activeHorse.tsx.
// `ownerId` (Supabase auth.uid() des Besitzers, von lib/sync.ts beim Pull mitgeliefert) ist
// optional, weil ein frisch lokal angelegtes, noch nie synchronisiertes Pferd ihn noch nicht
// kennt – dient sowohl dazu, im Umschalter das eigene Pferd zuerst zu zeigen, als auch dazu,
// Umbenennen/Löschen in HorseSection.tsx nur für tatsächlich eigene Pferde anzubieten (nur der
// Owner darf laut Supabase-Regel schreibend zugreifen).
// `deletedAt` markiert weiches Löschen wie bei den anderen Tabellen (siehe lib/sync.ts):
// löscht man ein Pferd, werden zusätzlich alle zugehörigen Betreuer:innen/Aufgaben/Zeitfenster/
// Termine mit weich gelöscht (siehe HorseSection.tsx).
export interface Horse {
  id: string;
  name: string;
  updatedAt: number;
  ownerId?: string;
  deletedAt?: number;
}

// Eine Person, die sich um das Pferd kümmern kann (z.B. Besitzerin, Reitbeteiligung, Stallnachbarin).
// `deletedAt` markiert weiches Löschen (siehe lib/sync.ts) statt die Zeile zu entfernen, damit
// eine Löschung beim Sync wie jede andere Änderung per Last-Write-Wins verteilt werden kann.
// `userId` verknüpft den Betreuer optional mit dem eigenen Supabase-Account ("Das bin ich",
// siehe CaretakersSection.tsx) – dient als Vorauswahl beim Anlegen neuer Termine
// (CareEntryForm.tsx), maximal ein Betreuer pro Pferd und Account.
export interface Caretaker {
  id: string;
  horseId: string;
  name: string;
  // Hex-Farbe zur schnellen visuellen Unterscheidung im Wochenplan.
  color: string;
  updatedAt: number;
  deletedAt?: number;
  userId?: string;
}

// Ein wählbares Zeitfenster (z.B. "Morgens"), frei in der Verwaltung gepflegt.
// `order` bestimmt die Reihenfolge in Auswahllisten und im Wochenplan.
export interface TimeSlotDef {
  id: string;
  horseId: string;
  label: string;
  order: number;
  updatedAt: number;
  deletedAt?: number;
}

// Eine wählbare Aufgabe (z.B. "Füttern"), frei in der Verwaltung gepflegt.
// Dient als Vorbelegung für neue Termine; einzelne Aufgaben können pro Termin
// trotzdem frei ergänzt/entfernt werden, ohne die Stammdaten zu ändern.
export interface TaskDef {
  id: string;
  horseId: string;
  label: string;
  order: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface CareTaskState {
  label: string;
  done: boolean;
}

// Ein Betreuungs-Termin: ein Zeitfenster an einem Tag, zugeordnet zu einer Person, mit Aufgaben.
// `mealId` verknüpft optional eine Fütterung-Mahlzeit (z.B. "Frühstück") mit diesem Termin,
// damit im Wochenplan direkt sichtbar ist, was zubereitet werden muss.
// `mealDeductedAt` markiert, ob/wann die Zutatenmengen dieser Mahlzeit bereits vom Vorrat
// abgezogen wurden (siehe lib/stock.ts) – verhindert doppelten Abzug bei jedem App-Start.
// Bewusst NICHT Teil des Supabase-Sync (siehe lib/sync.ts): der Vorratsabzug hängt an lokalen,
// nicht synchronisierten Zutaten, ist also grundsätzlich pro Gerät zu verstehen.
export interface CareEntry {
  id: string;
  horseId: string;
  dateStr: string; // 'YYYY-MM-DD'
  timeSlotId: string;
  caretakerId: string;
  tasks: CareTaskState[];
  note?: string;
  mealId?: string;
  mealDeductedAt?: number;
  updatedAt: number;
  deletedAt?: number;
}

// Eine Zutat als Grunddatum (z.B. "Heucobs"), einmal angelegt und in beliebig vielen
// Mahlzeiten wiederverwendbar. Die Einheit lebt hier, damit sie beim Zusammenstellen
// einer Mahlzeit nicht jedes Mal neu eingegeben werden muss.
// `stock` ist der aktuelle Bestand, `fullAmount` die Menge bei voller Auffüllung
// (z.B. Sackgröße) – dient als 100%-Referenz für die Vorrats-Balkenanzeige.
export interface Ingredient {
  id: string;
  name: string;
  unit: string; // z.B. 'g', 'ml', 'Stück'
  manufacturer?: string;
  stock?: number;
  fullAmount?: number;
}

// Eine Zutat innerhalb einer Mahlzeit mit der dafür vorgesehenen Menge (in der Einheit
// der referenzierten Ingredient).
export interface MealIngredient {
  ingredientId: string;
  amount: number;
}

// Eine wiederverwendbare Mahlzeit-Vorlage (z.B. "Frühstück"): woraus sie sich zusammensetzt
// und wie sie zubereitet wird. Noch ohne Zeitbezug – das Verknüpfen mit einer Uhrzeit/dem
// Wochenplan ist ein bewusst zurückgestellter nächster Schritt.
export interface Meal {
  id: string;
  name: string;
  ingredients: MealIngredient[];
  prepSteps: string[];
  tip?: string;
}

// Ein Gewichts-Eintrag. Ein Eintrag pro Kalendertag, erneutes Speichern am selben Tag
// überschreibt den vorherigen Wert (siehe upsertWeightEntry in db.ts).
export interface WeightEntry {
  id: string;
  dateStr: string; // 'YYYY-MM-DD'
  weightKg: number;
}

export const HEALTH_CATEGORIES = ['impfung', 'wurmkur', 'hufschmied'] as const;
export type HealthCategory = (typeof HEALTH_CATEGORIES)[number];

export const HEALTH_CATEGORY_LABELS: Record<HealthCategory, string> = {
  impfung: 'Impfungen',
  wurmkur: 'Wurmkur',
  hufschmied: 'Hufschmied',
};

// Ein protokolliertes Gesundheits-Ereignis (z.B. eine Impfung). `nextDueDateStr` ist die
// optionale nächste Fälligkeit (z.B. Auffrischung), damit die Übersicht "nächste: ..." zeigen
// kann statt nur des letzten Termins.
export interface HealthEvent {
  id: string;
  category: HealthCategory;
  dateStr: string; // wann es gemacht wurde
  nextDueDateStr?: string;
  note?: string;
}
