import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getCurrentHorseId, newId } from '../../db/db'

const COLOR_CHOICES = [
  '#b5793a', // Sattelbraun
  '#7c9464', // Salbeigrün
  '#6c8a94', // Taubenblau
  '#c0784f', // Terrakotta
  '#9c8f5f', // Sand
  '#8a6fa0', // Pflaume
  '#b56a6a', // Rostrot
  '#5f9a8f', // Petrol
]

export default function CaretakersSection() {
  const caretakers = useLiveQuery(() => db.caretakers.orderBy('name').filter((c) => !c.deletedAt).toArray(), [])
  const [name, setName] = useState('')
  const [color, setColor] = useState(COLOR_CHOICES[0])
  const [editingId, setEditingId] = useState<string | null>(null)

  function startEdit(id: string, currentName: string, currentColor: string) {
    setEditingId(id)
    setName(currentName)
    setColor(currentColor)
  }

  function resetForm() {
    setEditingId(null)
    setName('')
    setColor(COLOR_CHOICES[0])
  }

  async function handleSave() {
    const trimmed = name.trim()
    if (!trimmed) return
    if (editingId) {
      await db.caretakers.update(editingId, { name: trimmed, color, updatedAt: Date.now() })
    } else {
      const horseId = await getCurrentHorseId()
      await db.caretakers.add({ id: newId(), horseId, name: trimmed, color, updatedAt: Date.now() })
    }
    resetForm()
  }

  async function handleDelete(id: string) {
    if (!confirm('Betreuer:in löschen? Zugehörige Plan-Einträge werden ebenfalls entfernt.')) return
    // Weiches Löschen statt Entfernen, damit es beim Supabase-Sync mitläuft (lib/sync.ts).
    const now = Date.now()
    await db.careEntries
      .where('caretakerId')
      .equals(id)
      .modify({ deletedAt: now, updatedAt: now })
    await db.caretakers.update(id, { deletedAt: now, updatedAt: now })
    if (editingId === id) resetForm()
  }

  return (
    <div>
      <p className="hint">Wer kann sich um das Pferd kümmern? Im Wochenplan wählst du daraus aus.</p>

      <div className="card-list">
        {caretakers?.length === 0 && (
          <p className="empty-state">Noch niemand angelegt. Füge unten die erste Person hinzu.</p>
        )}
        {caretakers?.map((c) => (
          <div className="caretaker-card" key={c.id}>
            <span className="caretaker-dot-lg" style={{ background: c.color }} />
            <span className="caretaker-card-name">{c.name}</span>
            <button className="icon-button" onClick={() => startEdit(c.id, c.name, c.color)} aria-label="Bearbeiten">
              ✎
            </button>
            <button className="icon-button" onClick={() => handleDelete(c.id)} aria-label="Löschen">
              ✕
            </button>
          </div>
        ))}
      </div>

      <div className="edit-panel">
        <h3>{editingId ? 'Betreuer:in bearbeiten' : 'Neue Person hinzufügen'}</h3>
        <div className="field">
          <span>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="z.B. Sabine" />
        </div>
        <div className="field">
          <span>Farbe</span>
          <div className="color-swatch-row">
            {COLOR_CHOICES.map((c) => (
              <button
                key={c}
                type="button"
                className={`color-swatch${color === c ? ' selected' : ''}`}
                style={{ background: c }}
                onClick={() => setColor(c)}
                aria-label={`Farbe ${c} wählen`}
              />
            ))}
          </div>
        </div>
        <div className="edit-panel-actions">
          {editingId && (
            <button className="secondary-button" onClick={resetForm}>
              Abbrechen
            </button>
          )}
          <button className="primary-button" onClick={handleSave} disabled={!name.trim()}>
            {editingId ? 'Speichern' : 'Hinzufügen'}
          </button>
        </div>
      </div>
    </div>
  )
}
