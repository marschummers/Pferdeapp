import { useState } from 'react'
import { db } from '../../db/db'
import { useActiveHorse } from '../../lib/activeHorse'
import type { Horse } from '../../db/types'

export default function HorseSection() {
  const { horses, activeHorseId, setActiveHorseId } = useActiveHorse()

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')

  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')

  function startEdit(horse: Horse) {
    setEditingId(horse.id)
    setEditingName(horse.name)
  }

  async function saveEdit() {
    const trimmed = editingName.trim()
    if (!trimmed || !editingId) return
    await db.horses.update(editingId, { name: trimmed, updatedAt: Date.now() })
    setEditingId(null)
  }

  function startDelete(horse: Horse) {
    setDeletingId(horse.id)
    setDeleteConfirmText('')
  }

  async function confirmDelete(horse: Horse) {
    if (deleteConfirmText.trim() !== horse.name) return
    const now = Date.now()
    // Weiches Löschen kaskadiert von Hand auf alle zugehörigen Zeilen (kein Fremdschlüssel-
    // Cascade, da wir nie hart löschen, siehe lib/sync.ts) – sonst blieben Termine/Betreuer:innen
    // eines gelöschten Pferds als Karteileichen aktiv liegen.
    await db.transaction(
      'rw',
      db.horses,
      db.caretakers,
      db.taskDefs,
      db.timeSlotDefs,
      db.careEntries,
      async () => {
        await db.horses.update(horse.id, { deletedAt: now, updatedAt: now })
        await db.caretakers.where('horseId').equals(horse.id).modify({ deletedAt: now, updatedAt: now })
        await db.taskDefs.where('horseId').equals(horse.id).modify({ deletedAt: now, updatedAt: now })
        await db.timeSlotDefs.where('horseId').equals(horse.id).modify({ deletedAt: now, updatedAt: now })
        await db.careEntries.where('horseId').equals(horse.id).modify({ deletedAt: now, updatedAt: now })
      },
    )
    setDeletingId(null)
  }

  const deletingHorse = horses.find((h) => h.id === deletingId)

  return (
    <div>
      <p className="hint">
        Alle Pferde, auf die du Zugriff hast. Löschen entfernt auch alle zugehörigen Termine,
        Betreuer:innen, Aufgaben und Zeitfenster dieses Pferds – für alle, die mitsynchronisieren.
      </p>

      <div className="card-list">
        {horses.map((horse) => (
          <div className="horse-manage-card" key={horse.id}>
            <div className="horse-manage-card-row">
              {editingId === horse.id ? (
                <>
                  <input
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        saveEdit()
                      }
                    }}
                    autoFocus
                  />
                  <button className="icon-button" onClick={saveEdit} aria-label="Speichern">
                    ✓
                  </button>
                </>
              ) : (
                <>
                  <span className="horse-manage-name">
                    🐴 {horse.name}
                    {horse.id === activeHorseId && <span className="horse-manage-active-badge">aktiv</span>}
                  </span>
                  <button className="icon-button" onClick={() => startEdit(horse)} aria-label="Umbenennen">
                    ✎
                  </button>
                  <button className="icon-button" onClick={() => startDelete(horse)} aria-label="Löschen">
                    ✕
                  </button>
                </>
              )}
            </div>
            {/* Bewusst kein Ein-Klick-Umschalter auf der Hauptseite – welches Pferd auf diesem
                Gerät "aktiv" ist (bestimmt u.a., wo neue Termine landen), wechselt nur hier
                über einen expliziten Button. */}
            {horse.id !== activeHorseId && editingId !== horse.id && (
              <button
                className="secondary-button horse-activate-button"
                onClick={() => setActiveHorseId(horse.id)}
              >
                Für dieses Gerät verwenden
              </button>
            )}
          </div>
        ))}
      </div>

      {deletingHorse && (
        <div className="edit-panel horse-delete-confirm">
          <h3>„{deletingHorse.name}“ wirklich löschen?</h3>
          <p className="hint">
            Löscht auch alle Termine, Betreuer:innen, Aufgaben und Zeitfenster dieses Pferds – für alle, die
            mitsynchronisieren. Das kann nicht rückgängig gemacht werden. Tippe zur Bestätigung den Namen „
            {deletingHorse.name}“ ein:
          </p>
          <div className="field">
            <input
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder={deletingHorse.name}
              autoFocus
            />
          </div>
          <div className="edit-panel-actions">
            <button className="secondary-button" onClick={() => setDeletingId(null)}>
              Abbrechen
            </button>
            <button
              className="primary-button horse-delete-button"
              onClick={() => confirmDelete(deletingHorse)}
              disabled={deleteConfirmText.trim() !== deletingHorse.name}
            >
              Endgültig löschen
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
