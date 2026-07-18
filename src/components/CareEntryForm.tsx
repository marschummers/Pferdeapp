import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { CareEntry, CareTaskState, Caretaker } from '../db/types'
import { db, getCurrentHorseId, newId } from '../db/db'

interface Props {
  dateStr: string
  caretakers: Caretaker[]
  entry?: CareEntry
  onClose: () => void
}

export default function CareEntryForm({ dateStr, caretakers, entry, onClose }: Props) {
  const timeSlotDefs = useLiveQuery(() => db.timeSlotDefs.orderBy('order').toArray(), []) ?? []
  const taskDefs = useLiveQuery(() => db.taskDefs.orderBy('order').toArray(), []) ?? []
  const meals = useLiveQuery(() => db.meals.orderBy('name').toArray(), []) ?? []

  const [timeSlotId, setTimeSlotId] = useState(entry?.timeSlotId ?? '')
  const [caretakerId, setCaretakerId] = useState(entry?.caretakerId ?? caretakers[0]?.id ?? '')
  const [tasks, setTasks] = useState<CareTaskState[] | null>(entry?.tasks ?? null)
  const [note, setNote] = useState(entry?.note ?? '')
  const [newTask, setNewTask] = useState('')
  const [mealId, setMealId] = useState(entry?.mealId ?? '')

  // Für neue Termine warten wir, bis die Aufgaben-Stammdaten geladen sind, und übernehmen
  // sie als Vorbelegung; danach lebt die Liste unabhängig davon im lokalen Formular-State.
  const effectiveTasks = tasks ?? taskDefs.map((t) => ({ label: t.label, done: false }))
  const effectiveTimeSlotId = timeSlotId || timeSlotDefs[0]?.id || ''

  if (caretakers.length === 0) {
    return (
      <div className="edit-panel">
        <p className="hint">Lege zuerst mindestens eine Betreuer:in an (Tab „Verwaltung"), bevor du Termine planst.</p>
        <button className="secondary-button" onClick={onClose}>
          Schließen
        </button>
      </div>
    )
  }

  if (timeSlotDefs.length === 0) {
    return (
      <div className="edit-panel">
        <p className="hint">Lege zuerst mindestens ein Zeitfenster an (Tab „Verwaltung"), bevor du Termine planst.</p>
        <button className="secondary-button" onClick={onClose}>
          Schließen
        </button>
      </div>
    )
  }

  function toggleTask(index: number) {
    setTasks(effectiveTasks.map((t, i) => (i === index ? { ...t, done: !t.done } : t)))
  }

  function removeTask(index: number) {
    setTasks(effectiveTasks.filter((_, i) => i !== index))
  }

  function addTask() {
    const label = newTask.trim()
    if (!label) return
    setTasks([...effectiveTasks, { label, done: false }])
    setNewTask('')
  }

  async function handleSave() {
    if (!caretakerId || !effectiveTimeSlotId) return
    if (entry) {
      await db.careEntries.update(entry.id, {
        timeSlotId: effectiveTimeSlotId,
        caretakerId,
        tasks: effectiveTasks,
        note: note.trim() || undefined,
        mealId: mealId || undefined,
        updatedAt: Date.now(),
      })
    } else {
      const horseId = await getCurrentHorseId()
      await db.careEntries.add({
        id: newId(),
        horseId,
        dateStr,
        timeSlotId: effectiveTimeSlotId,
        caretakerId,
        tasks: effectiveTasks,
        note: note.trim() || undefined,
        mealId: mealId || undefined,
        updatedAt: Date.now(),
      })
    }
    onClose()
  }

  async function handleDelete() {
    if (!entry) return
    if (!confirm('Eintrag löschen?')) return
    await db.careEntries.delete(entry.id)
    onClose()
  }

  return (
    <div className="edit-panel">
      <div className="field-row">
        <div className="field">
          <span>Zeitfenster</span>
          <select value={effectiveTimeSlotId} onChange={(e) => setTimeSlotId(e.target.value)}>
            {timeSlotDefs.map((slot) => (
              <option key={slot.id} value={slot.id}>
                {slot.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <span>Betreuer:in</span>
          <select value={caretakerId} onChange={(e) => setCaretakerId(e.target.value)}>
            {caretakers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="field">
        <span>Aufgaben</span>
        <div className="task-chip-list">
          {effectiveTasks.map((t, i) => (
            <span className={`task-chip${t.done ? ' done' : ''}`} key={`${t.label}-${i}`}>
              <input type="checkbox" checked={t.done} onChange={() => toggleTask(i)} />
              {t.label}
              <button type="button" onClick={() => removeTask(i)} aria-label={`${t.label} entfernen`}>
                ✕
              </button>
            </span>
          ))}
        </div>
        <div className="task-add-row">
          <input
            value={newTask}
            onChange={(e) => setNewTask(e.target.value)}
            placeholder="Weitere Aufgabe…"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addTask()
              }
            }}
          />
          <button type="button" onClick={addTask}>
            +
          </button>
        </div>
      </div>

      {meals.length > 0 && (
        <div className="field">
          <span>Mahlzeit (optional)</span>
          <select value={mealId} onChange={(e) => setMealId(e.target.value)}>
            <option value="">– keine –</option>
            {meals.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="field">
        <span>Notiz (optional)</span>
        <textarea
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="z.B. Tierarzt kommt vorbei"
        />
      </div>

      <div className="edit-panel-actions">
        <button className="secondary-button" onClick={onClose}>
          Abbrechen
        </button>
        <button className="primary-button" onClick={handleSave}>
          Speichern
        </button>
      </div>
      {entry && (
        <button className="delete-button" onClick={handleDelete}>
          Eintrag löschen
        </button>
      )}
    </div>
  )
}
