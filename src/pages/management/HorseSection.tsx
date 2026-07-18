import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'

export default function HorseSection() {
  const horse = useLiveQuery(() => db.horses.toCollection().first(), [])
  const [name, setName] = useState('')

  // Formular-Feld einmalig mit dem geladenen Namen befüllen, danach lebt es unabhängig
  // davon weiter (kein Zurückspringen, während man tippt).
  useEffect(() => {
    if (horse) setName((current) => (current === '' ? horse.name : current))
  }, [horse])

  async function handleSave() {
    const trimmed = name.trim()
    if (!trimmed || !horse) return
    await db.horses.update(horse.id, { name: trimmed, updatedAt: Date.now() })
  }

  return (
    <div>
      <p className="hint">Der Name deines Pferds – wird später sichtbar, wenn ihr euch mit Freund:innen synct.</p>

      <div className="edit-panel">
        <div className="field">
          <span>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="z.B. Luna" />
        </div>
        <button className="primary-button" onClick={handleSave} disabled={!name.trim() || !horse}>
          Speichern
        </button>
      </div>
    </div>
  )
}
