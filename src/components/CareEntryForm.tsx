import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { CareEntry, CareTaskState, Caretaker } from '../db/types'
import { db, newId } from '../db/db'
import { useAuth } from '../lib/auth'

interface Props {
  // Pferd, zu dem dieser Termin gehört – kommt von WeekPage.tsx als `viewedHorseId` (das
  // gerade angesehene Pferd, nicht zwingend das für dieses Gerät aktive), damit man auch beim
  // Ansehen eines fremden Kalenders (Cross-Pferd-Hinweis) dort korrekt Termine anlegen/bearbeiten
  // kann, ohne das eigene aktive Pferd zu wechseln.
  horseId: string
  dateStr: string
  caretakers: Caretaker[]
  // Betreuer:innen anderer angemeldeter Accounts (nicht dieses Pferds), damit man auch vom
  // eigenen Kalender aus Aufgaben an andere Personen vergeben kann – siehe WeekPage.tsx.
  otherCaretakers: Caretaker[]
  entry?: CareEntry
  onClose: () => void
}

export default function CareEntryForm({ horseId, dateStr, caretakers, otherCaretakers, entry, onClose }: Props) {
  const { session } = useAuth()
  const timeSlotDefs =
    useLiveQuery(
      () => db.timeSlotDefs.orderBy('order').filter((t) => t.horseId === horseId && !t.deletedAt).toArray(),
      [horseId],
    ) ?? []
  const taskDefs =
    useLiveQuery(
      () => db.taskDefs.orderBy('order').filter((t) => t.horseId === horseId && !t.deletedAt).toArray(),
      [horseId],
    ) ?? []
  const meals = useLiveQuery(() => db.meals.orderBy('name').toArray(), []) ?? []

  // Bei neuen Terminen den eigenen, per "Das bin ich" markierten Betreuer vorauswählen
  // (siehe CaretakersSection.tsx) statt einfach den ersten in der Liste.
  const myCaretakerId = caretakers.find((c) => c.userId === session?.user.id)?.id

  const [timeSlotId, setTimeSlotId] = useState(entry?.timeSlotId ?? '')
  const [caretakerId, setCaretakerId] = useState(entry?.caretakerId ?? myCaretakerId ?? caretakers[0]?.id ?? '')
  const [tasks, setTasks] = useState<CareTaskState[] | null>(entry?.tasks ?? null)
  const [note, setNote] = useState(entry?.note ?? '')
  const [newTask, setNewTask] = useState('')
  const [mealId, setMealId] = useState(entry?.mealId ?? '')

  // Neue Termine starten bewusst OHNE Aufgaben – die Stammdaten-Aufgaben (taskDefs) werden nur
  // noch als Vorschläge angeboten (siehe taskSuggestions unten) und bei Bedarf einzeln
  // hinzugefügt, statt automatisch alle vorzubelegen.
  const effectiveTasks = tasks ?? []
  const effectiveTimeSlotId = timeSlotId || timeSlotDefs[0]?.id || ''
  const taskSuggestions = taskDefs.filter((t) => !effectiveTasks.some((et) => et.label === t.label))

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

  function addTaskFromSuggestion(label: string) {
    setTasks([...effectiveTasks, { label, done: false }])
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
    // Weiches Löschen statt Entfernen: läuft dadurch wie jede andere Änderung mit durch den
    // Supabase-Sync, siehe lib/sync.ts.
    await db.careEntries.update(entry.id, { deletedAt: Date.now(), updatedAt: Date.now() })
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
            <optgroup label="Dieses Pferd">
              {caretakers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </optgroup>
            {otherCaretakers.length > 0 && (
              <optgroup label="Andere angemeldete Personen">
                {otherCaretakers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </div>
      </div>

      <div className="field">
        <span>Aufgaben</span>
        {effectiveTasks.length === 0 && taskSuggestions.length > 0 && (
          <p className="hint">Noch keine Aufgabe hinzugefügt – unten aus den Stammdaten auswählen oder frei eintragen.</p>
        )}
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
        {taskSuggestions.length > 0 && (
          <div className="task-suggestion-list">
            {taskSuggestions.map((t) => (
              <button
                key={t.id}
                type="button"
                className="task-suggestion-chip"
                onClick={() => addTaskFromSuggestion(t.label)}
              >
                + {t.label}
              </button>
            ))}
          </div>
        )}
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
