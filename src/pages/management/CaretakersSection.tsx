import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getCurrentHorseId, newId } from '../../db/db'
import { useActiveHorse } from '../../lib/activeHorse'
import { useAuth } from '../../lib/auth'

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
  const { session } = useAuth()
  const { activeHorseId } = useActiveHorse()
  const caretakers = useLiveQuery(
    () => db.caretakers.orderBy('name').filter((c) => c.horseId === activeHorseId && !c.deletedAt).toArray(),
    [activeHorseId],
  )
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
      // Die erste Person, die für ein Pferd angelegt wird, ist so gut wie immer man selbst –
      // automatisch mit "Das bin ich" verknüpfen (siehe handleToggleMe), statt das per Stern
      // separat erledigen zu müssen. Bleibt danach normal togglebar/entfernbar.
      const isFirstCaretaker = (caretakers?.length ?? 0) === 0
      await db.caretakers.add({
        id: newId(),
        horseId,
        name: trimmed,
        color,
        updatedAt: Date.now(),
        ...(isFirstCaretaker && session ? { userId: session.user.id } : {}),
      })
    }
    resetForm()
  }

  // Markiert einen Betreuer als "Das bin ich" (verknüpft ihn mit dem eigenen Account) bzw.
  // hebt die Markierung wieder auf. Pro Pferd und Account darf immer nur ein Betreuer verknüpft
  // sein – eine vorherige Markierung wird beim Setzen einer neuen automatisch entfernt.
  async function handleToggleMe(caretaker: NonNullable<typeof caretakers>[number]) {
    if (!session) return
    const now = Date.now()
    if (caretaker.userId === session.user.id) {
      await db.caretakers.update(caretaker.id, { userId: undefined, updatedAt: now })
      return
    }
    const previous = caretakers?.find((c) => c.userId === session.user.id)
    if (previous) {
      await db.caretakers.update(previous.id, { userId: undefined, updatedAt: now })
    }
    await db.caretakers.update(caretaker.id, { userId: session.user.id, updatedAt: now })
  }

  async function handleDelete(id: string) {
    if (!confirm('Betreuer:in löschen? Zugehörige Plan-Einträge auf diesem Pferd werden ebenfalls entfernt.')) return
    // Weiches Löschen statt Entfernen, damit es beim Supabase-Sync mitläuft (lib/sync.ts).
    const now = Date.now()
    // Nur Termine AUF DIESEM Pferd mitlöschen: seit der Cross-Pferd-Zuweisung (WeekPage.tsx)
    // können auch andere Pferde auf diese Betreuer-Zeile verweisen – solche Termine sollen
    // erhalten bleiben (zeigen dann "(gelöscht)" als Namen, siehe EntryCard).
    await db.careEntries
      .where('caretakerId')
      .equals(id)
      .and((e) => e.horseId === activeHorseId)
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
            {session && (
              <button
                className={`caretaker-me-toggle${c.userId === session.user.id ? ' active' : ''}`}
                onClick={() => handleToggleMe(c)}
                title={c.userId === session.user.id ? 'Das bist du' : 'Als „Das bin ich“ markieren'}
                aria-label={c.userId === session.user.id ? 'Das bist du' : 'Als „Das bin ich“ markieren'}
              >
                {c.userId === session.user.id ? '★' : '☆'}
              </button>
            )}
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
