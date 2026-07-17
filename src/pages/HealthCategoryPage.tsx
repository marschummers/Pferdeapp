import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, newId } from '../db/db'
import { HEALTH_CATEGORY_LABELS, type HealthCategory, type HealthEvent } from '../db/types'
import { formatShortDate, todayStr } from '../lib/date'

export default function HealthCategoryPage() {
  const { category } = useParams<{ category: HealthCategory }>()
  const label = category ? HEALTH_CATEGORY_LABELS[category] : ''

  const entries =
    useLiveQuery(
      () =>
        category
          ? db.healthEvents.where('category').equals(category).toArray()
          : Promise.resolve<HealthEvent[]>([]),
      [category],
    ) ?? []
  const sorted = [...entries].sort((a, b) => b.dateStr.localeCompare(a.dateStr))

  const [date, setDate] = useState(todayStr())
  const [nextDue, setNextDue] = useState('')
  const [note, setNote] = useState('')

  async function handleAdd() {
    if (!category || !date) return
    await db.healthEvents.add({
      id: newId(),
      category,
      dateStr: date,
      nextDueDateStr: nextDue || undefined,
      note: note.trim() || undefined,
    })
    setNextDue('')
    setNote('')
  }

  async function handleDelete(id: string) {
    if (!confirm('Eintrag löschen?')) return
    await db.healthEvents.delete(id)
  }

  if (!category) return null

  return (
    <div>
      <Link to="/gesundheit" className="back-link">
        ‹ Gesundheit
      </Link>
      <h1>{label}</h1>

      <div className="edit-panel">
        <h3>Neuer Eintrag</h3>
        <div className="field-row">
          <div className="field">
            <span>Datum</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="field">
            <span>Nächste Fälligkeit (optional)</span>
            <input type="date" value={nextDue} onChange={(e) => setNextDue(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <span>Notiz (optional)</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="z.B. Tetanus + Influenza" />
        </div>
        <button className="primary-button" onClick={handleAdd} disabled={!date}>
          Speichern
        </button>
      </div>

      <p className="hint">Verlauf</p>
      <div className="card-list">
        {sorted.length === 0 && <p className="empty-state">Noch keine Einträge.</p>}
        {sorted.map((e) => (
          <div className="history-row" key={e.id}>
            <div className="history-row-main">
              <span className="history-row-date">{formatShortDate(e.dateStr)}</span>
              {e.nextDueDateStr && (
                <span className="history-row-next">nächste: {formatShortDate(e.nextDueDateStr)}</span>
              )}
              {e.note && <span className="history-row-note">{e.note}</span>}
            </div>
            <button className="icon-button" onClick={() => handleDelete(e.id)} aria-label="Eintrag löschen">
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
