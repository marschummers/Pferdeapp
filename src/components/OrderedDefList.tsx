import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { EntityTable } from 'dexie'
import { newId } from '../db/db'

interface Def {
  id: string
  label: string
  order: number
}

interface Props {
  table: EntityTable<Def, 'id'>
  placeholder: string
  emptyHint: string
  deleteConfirm: (label: string) => string
}

// Verwaltet eine sortierbare Liste einfacher Stammdaten-Einträge (Label + Reihenfolge).
// Wird sowohl für Aufgaben als auch für Zeitfenster verwendet, da beide dieselbe Form haben.
export default function OrderedDefList({ table, placeholder, emptyHint, deleteConfirm }: Props) {
  const items = useLiveQuery(() => table.orderBy('order').toArray(), [table]) ?? []
  const [newLabel, setNewLabel] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingLabel, setEditingLabel] = useState('')

  async function handleAdd() {
    const label = newLabel.trim()
    if (!label) return
    const maxOrder = items.reduce((max, i) => Math.max(max, i.order), -1)
    await table.add({ id: newId(), label, order: maxOrder + 1 })
    setNewLabel('')
  }

  function startEdit(id: string, label: string) {
    setEditingId(id)
    setEditingLabel(label)
  }

  async function saveEdit() {
    const label = editingLabel.trim()
    if (!editingId || !label) return
    await table.update(editingId, { label })
    setEditingId(null)
  }

  async function handleDelete(id: string, label: string) {
    if (!confirm(deleteConfirm(label))) return
    await table.delete(id)
  }

  async function move(index: number, direction: -1 | 1) {
    const otherIndex = index + direction
    if (otherIndex < 0 || otherIndex >= items.length) return
    const a = items[index]
    const b = items[otherIndex]
    await table.update(a.id, { order: b.order })
    await table.update(b.id, { order: a.order })
  }

  return (
    <div>
      <div className="card-list">
        {items.length === 0 && <p className="empty-state">{emptyHint}</p>}
        {items.map((item, index) => (
          <div className="ordered-item-card" key={item.id}>
            <div className="ordered-item-move">
              <button
                className="icon-button"
                disabled={index === 0}
                onClick={() => move(index, -1)}
                aria-label="Nach oben verschieben"
              >
                ▲
              </button>
              <button
                className="icon-button"
                disabled={index === items.length - 1}
                onClick={() => move(index, 1)}
                aria-label="Nach unten verschieben"
              >
                ▼
              </button>
            </div>
            {editingId === item.id ? (
              <>
                <input
                  value={editingLabel}
                  onChange={(e) => setEditingLabel(e.target.value)}
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
                <span className="ordered-item-label">{item.label}</span>
                <button className="icon-button" onClick={() => startEdit(item.id, item.label)} aria-label="Bearbeiten">
                  ✎
                </button>
              </>
            )}
            <button className="icon-button" onClick={() => handleDelete(item.id, item.label)} aria-label="Löschen">
              ✕
            </button>
          </div>
        ))}
      </div>
      <div className="task-add-row">
        <input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder={placeholder}
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
