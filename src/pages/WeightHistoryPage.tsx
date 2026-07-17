import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, upsertWeightEntry } from '../db/db'
import { formatShortDate, todayStr } from '../lib/date'

export default function WeightHistoryPage() {
  const entries = useLiveQuery(() => db.weightEntries.orderBy('dateStr').reverse().toArray(), []) ?? []
  const [date, setDate] = useState(todayStr())
  const [weight, setWeight] = useState('')

  async function handleAdd() {
    const value = parseFloat(weight)
    if (!date || !value || value <= 0) return
    await upsertWeightEntry(date, value)
    setWeight('')
  }

  async function handleDelete(id: string) {
    if (!confirm('Eintrag löschen?')) return
    await db.weightEntries.delete(id)
  }

  return (
    <div>
      <Link to="/gesundheit" className="back-link">
        ‹ Gesundheit
      </Link>
      <h1>Gewicht</h1>

      <div className="edit-panel">
        <h3>Neuer Eintrag</h3>
        <div className="field-row">
          <div className="field">
            <span>Datum</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="field">
            <span>Gewicht (kg)</span>
            <input
              type="number"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              placeholder="z.B. 535"
            />
          </div>
        </div>
        <button className="primary-button" onClick={handleAdd} disabled={!date || !weight}>
          Speichern
        </button>
      </div>

      <p className="hint">Verlauf</p>
      <div className="card-list">
        {entries.length === 0 && <p className="empty-state">Noch keine Einträge.</p>}
        {entries.map((e) => (
          <div className="history-row" key={e.id}>
            <span className="history-row-date">{formatShortDate(e.dateStr)}</span>
            <span className="history-row-value">{e.weightKg} kg</span>
            <button className="icon-button" onClick={() => handleDelete(e.id)} aria-label="Eintrag löschen">
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
