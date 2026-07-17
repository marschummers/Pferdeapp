import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import type { Ingredient } from '../db/types'

function stockColor(pct: number): string {
  if (pct >= 40) return 'var(--accent-2)'
  if (pct >= 15) return 'var(--accent)'
  return 'var(--danger)'
}

export default function StockPage() {
  const ingredients = useLiveQuery(() => db.ingredients.orderBy('name').toArray(), [])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [stockDraft, setStockDraft] = useState('')
  const [fullDraft, setFullDraft] = useState('')

  function startEdit(ing: Ingredient) {
    setEditingId(ing.id)
    setStockDraft(String(ing.stock ?? 0))
    setFullDraft(ing.fullAmount ? String(ing.fullAmount) : '')
  }

  async function save(id: string) {
    const stock = parseFloat(stockDraft)
    const fullAmount = parseFloat(fullDraft)
    await db.ingredients.update(id, {
      stock: Number.isFinite(stock) ? stock : 0,
      fullAmount: Number.isFinite(fullAmount) && fullAmount > 0 ? fullAmount : undefined,
    })
    setEditingId(null)
  }

  async function refill(ing: Ingredient) {
    if (!ing.fullAmount) return
    await db.ingredients.update(ing.id, { stock: ing.fullAmount })
  }

  if (ingredients?.length === 0) {
    return (
      <div>
        <h1>Vorrat</h1>
        <p className="empty-state">Noch keine Zutaten angelegt – unter „Verwaltung → Zutaten“ anlegen.</p>
      </div>
    )
  }

  return (
    <div>
      <h1>Vorrat</h1>
      <p className="hint">
        Wird automatisch anhand der Mahlzeiten reduziert, die im Wochenplan eingeplant sind, sobald der Tag vorbei
        ist.
      </p>

      <div className="card-list">
        {ingredients?.map((ing) => {
          const stock = ing.stock ?? 0
          const pct = ing.fullAmount ? Math.max(0, Math.min(100, (stock / ing.fullAmount) * 100)) : null

          if (editingId === ing.id) {
            return (
              <div className="stock-card" key={ing.id}>
                <div className="field-row">
                  <div className="field">
                    <span>Aktueller Bestand ({ing.unit})</span>
                    <input
                      type="number"
                      value={stockDraft}
                      onChange={(e) => setStockDraft(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <div className="field">
                    <span>Voller Vorrat ({ing.unit})</span>
                    <input
                      type="number"
                      value={fullDraft}
                      onChange={(e) => setFullDraft(e.target.value)}
                      placeholder="z.B. 25000"
                    />
                  </div>
                </div>
                <div className="edit-panel-actions">
                  <button className="secondary-button" onClick={() => setEditingId(null)}>
                    Abbrechen
                  </button>
                  <button className="primary-button" onClick={() => save(ing.id)}>
                    Speichern
                  </button>
                </div>
              </div>
            )
          }

          return (
            <div className="stock-card" key={ing.id}>
              <div className="stock-row-top" onClick={() => startEdit(ing)}>
                <span className="stock-row-name">{ing.name}</span>
                <span className="stock-row-value">
                  {stock}
                  {ing.fullAmount ? ` / ${ing.fullAmount}` : ''} {ing.unit}
                </span>
              </div>
              {pct === null ? (
                <button className="stock-setup-hint" onClick={() => startEdit(ing)}>
                  Vorratsmenge festlegen, um den Füllstand anzuzeigen →
                </button>
              ) : (
                <div className="stock-bar-track" onClick={() => startEdit(ing)}>
                  <div className="stock-bar-fill" style={{ width: `${pct}%`, background: stockColor(pct) }} />
                </div>
              )}
              {ing.fullAmount !== undefined && stock < ing.fullAmount && (
                <button className="stock-refill-button" onClick={() => refill(ing)}>
                  ↻ Aufgefüllt auf {ing.fullAmount} {ing.unit}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
