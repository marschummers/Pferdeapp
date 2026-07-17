import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, newId } from '../../db/db'

const UNIT_SUGGESTIONS = ['g', 'kg', 'ml', 'l', 'Stück', 'EL', 'TL', 'Handvoll']

export default function IngredientsSection() {
  const ingredients = useLiveQuery(() => db.ingredients.orderBy('name').toArray(), [])
  const [name, setName] = useState('')
  const [unit, setUnit] = useState('')
  const [manufacturer, setManufacturer] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)

  function startEdit(id: string, current: { name: string; unit: string; manufacturer?: string }) {
    setEditingId(id)
    setName(current.name)
    setUnit(current.unit)
    setManufacturer(current.manufacturer ?? '')
  }

  function resetForm() {
    setEditingId(null)
    setName('')
    setUnit('')
    setManufacturer('')
  }

  async function handleSave() {
    const trimmedName = name.trim()
    const trimmedUnit = unit.trim()
    if (!trimmedName || !trimmedUnit) return
    const data = { name: trimmedName, unit: trimmedUnit, manufacturer: manufacturer.trim() || undefined }
    if (editingId) {
      await db.ingredients.update(editingId, data)
    } else {
      await db.ingredients.add({ id: newId(), ...data })
    }
    resetForm()
  }

  async function handleDelete(id: string) {
    if (!confirm('Zutat löschen? Sie wird aus bestehenden Mahlzeiten nicht automatisch entfernt.')) return
    await db.ingredients.delete(id)
    if (editingId === id) resetForm()
  }

  return (
    <div>
      <p className="hint">Einmal anlegen, dann in beliebig vielen Mahlzeiten unter „Fütterung“ wiederverwenden.</p>

      <div className="card-list">
        {ingredients?.length === 0 && (
          <p className="empty-state">Noch keine Zutaten angelegt. Füge unten die erste hinzu.</p>
        )}
        {ingredients?.map((i) => (
          <div className="ingredient-card" key={i.id}>
            <div className="ingredient-card-info">
              <span className="ingredient-card-name">{i.name}</span>
              {i.manufacturer && <span className="ingredient-card-manufacturer">{i.manufacturer}</span>}
            </div>
            <span className="ingredient-card-unit">{i.unit}</span>
            <button className="icon-button" onClick={() => startEdit(i.id, i)} aria-label="Bearbeiten">
              ✎
            </button>
            <button className="icon-button" onClick={() => handleDelete(i.id)} aria-label="Löschen">
              ✕
            </button>
          </div>
        ))}
      </div>

      <div className="edit-panel">
        <h3>{editingId ? 'Zutat bearbeiten' : 'Neue Zutat hinzufügen'}</h3>
        <div className="field-row">
          <div className="field" style={{ flex: 2 }}>
            <span>Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="z.B. Heucobs" />
          </div>
          <div className="field">
            <span>Einheit</span>
            <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="g" list="unit-suggestions" />
          </div>
        </div>
        <div className="field">
          <span>Hersteller (optional)</span>
          <input value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} placeholder="z.B. Marstall" />
        </div>
        <datalist id="unit-suggestions">
          {UNIT_SUGGESTIONS.map((u) => (
            <option key={u} value={u} />
          ))}
        </datalist>
        <div className="edit-panel-actions">
          {editingId && (
            <button className="secondary-button" onClick={resetForm}>
              Abbrechen
            </button>
          )}
          <button className="primary-button" onClick={handleSave} disabled={!name.trim() || !unit.trim()}>
            {editingId ? 'Speichern' : 'Hinzufügen'}
          </button>
        </div>
      </div>
    </div>
  )
}
