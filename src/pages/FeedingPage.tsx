import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getCurrentHorseId, newId } from '../db/db'
import { useActiveHorse } from '../lib/activeHorse'

export default function FeedingPage() {
  const { activeHorseId } = useActiveHorse()
  // Nur die eigenen Mahlzeiten – fremde Rezepte werden nicht hier durchsucht, sondern gezielt
  // über einen verknüpften Termin (CareEntry.mealId) geöffnet, siehe MealDetailPage.tsx.
  const meals = useLiveQuery(
    () => db.meals.orderBy('name').filter((m) => m.horseId === activeHorseId && !m.deletedAt).toArray(),
    [activeHorseId],
  )
  const [newName, setNewName] = useState('')
  const navigate = useNavigate()

  async function handleAdd() {
    const name = newName.trim()
    if (!name) return
    const id = newId()
    const horseId = await getCurrentHorseId()
    await db.meals.add({ id, horseId, name, ingredients: [], prepSteps: [], updatedAt: Date.now() })
    setNewName('')
    navigate(`/fuetterung/${id}`)
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Mahlzeit „${name}“ löschen?`)) return
    // Weiches Löschen statt Entfernen, damit es beim Supabase-Sync mitläuft (lib/sync.ts).
    await db.meals.update(id, { deletedAt: Date.now(), updatedAt: Date.now() })
  }

  return (
    <div>
      <h1>Fütterung</h1>
      <p className="hint">Lege Mahlzeiten mit Zutaten und Zubereitung an, z.B. „Frühstück“ oder „Abendmash“.</p>

      <div className="card-list">
        {meals?.length === 0 && (
          <p className="empty-state">Noch keine Mahlzeiten angelegt. Füge unten die erste hinzu.</p>
        )}
        {meals?.map((meal) => (
          <div className="meal-card" key={meal.id}>
            <button className="meal-card-main" onClick={() => navigate(`/fuetterung/${meal.id}`)}>
              <span className="meal-card-name">{meal.name}</span>
              <span className="meal-card-summary">
                {meal.ingredients.length} {meal.ingredients.length === 1 ? 'Zutat' : 'Zutaten'} ·{' '}
                {meal.prepSteps.length} {meal.prepSteps.length === 1 ? 'Schritt' : 'Schritte'}
              </span>
            </button>
            <button className="icon-button" onClick={() => handleDelete(meal.id, meal.name)} aria-label="Löschen">
              ✕
            </button>
          </div>
        ))}
      </div>

      <div className="task-add-row">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Neue Mahlzeit…"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              handleAdd()
            }
          }}
        />
        <button type="button" onClick={handleAdd}>
          +
        </button>
      </div>
    </div>
  )
}
