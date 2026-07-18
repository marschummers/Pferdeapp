import { useEffect, useState } from 'react'
import { db } from '../../db/db'
import { useActiveHorse } from '../../lib/activeHorse'

export default function HorseSection() {
  const { activeHorse } = useActiveHorse()
  const [name, setName] = useState('')

  // Formular-Feld mit dem Namen des aktiven Pferds befüllen – auch erneut, wenn man
  // zwischen Pferden umschaltet (nicht nur beim allerersten Laden).
  useEffect(() => {
    if (activeHorse) setName(activeHorse.name)
  }, [activeHorse?.id])

  async function handleSave() {
    const trimmed = name.trim()
    if (!trimmed || !activeHorse) return
    await db.horses.update(activeHorse.id, { name: trimmed, updatedAt: Date.now() })
  }

  return (
    <div>
      <p className="hint">Der Name dieses Pferds – wird sichtbar, wenn ihr euch mit Freund:innen synct.</p>

      <div className="edit-panel">
        <div className="field">
          <span>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="z.B. Luna" />
        </div>
        <button className="primary-button" onClick={handleSave} disabled={!name.trim() || !activeHorse}>
          Speichern
        </button>
      </div>
    </div>
  )
}
