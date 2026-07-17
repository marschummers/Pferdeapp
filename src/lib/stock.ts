import { db } from '../db/db'
import { todayStr } from './date'

// Zieht für alle vergangenen (oder heutigen) Wochenplan-Termine mit verknüpfter Mahlzeit die
// jeweiligen Zutatenmengen einmalig vom Vorrat ab. Läuft bei jedem App-Start und holt dabei
// automatisch auch Tage nach, die verpasst wurden, während die App nicht offen war.
// Bewusst vereinfacht: der Abzug hängt nur am Datum, nicht daran, ob einzelne Aufgaben im
// Termin abgehakt wurden – eine geplante Mahlzeit gilt als gegeben, sobald der Tag vorbei ist.
export async function applyPendingStockDeductions(): Promise<void> {
  const today = todayStr()
  const pending = await db.careEntries
    .filter((e) => !!e.mealId && !e.mealDeductedAt && e.dateStr <= today)
    .toArray()
  if (pending.length === 0) return

  for (const entry of pending) {
    await db.transaction('rw', db.ingredients, db.careEntries, db.meals, async () => {
      // Frisch innerhalb der Transaktion prüfen: falls dieser Termin zwischen dem obigen
      // Sammeln und jetzt bereits von einem parallelen Aufruf abgezogen wurde (z.B. durch
      // Reacts StrictMode, das Effects im Dev-Modus doppelt ausführt), hier abbrechen statt
      // ein zweites Mal abzuziehen.
      const current = await db.careEntries.get(entry.id)
      if (!current || current.mealDeductedAt || !current.mealId) return

      const meal = await db.meals.get(current.mealId)
      if (meal) {
        for (const mi of meal.ingredients) {
          const ingredient = await db.ingredients.get(mi.ingredientId)
          if (ingredient) {
            await db.ingredients.update(ingredient.id, { stock: (ingredient.stock ?? 0) - mi.amount })
          }
        }
      }
      await db.careEntries.update(entry.id, { mealDeductedAt: Date.now() })
    })
  }
}
