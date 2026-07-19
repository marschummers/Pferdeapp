import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { db } from '../db/db'
import type { CareEntry, Caretaker, Meal, TimeSlotDef } from '../db/types'
import { addDays, formatDayLabel, formatWeekRange, startOfWeek, toDateStr, todayStr, weekDates } from '../lib/date'
import { useActiveHorse } from '../lib/activeHorse'
import { useAuth } from '../lib/auth'
import CareEntryForm from '../components/CareEntryForm'
import HorseSwitcher from '../components/HorseSwitcher'

function EntryCard({
  entry,
  caretaker,
  timeSlot,
  meal,
  onEdit,
}: {
  entry: CareEntry
  caretaker?: Caretaker
  timeSlot?: TimeSlotDef
  meal?: Meal
  onEdit: () => void
}) {
  async function toggleTask(index: number) {
    const updated = entry.tasks.map((t, i) => (i === index ? { ...t, done: !t.done } : t))
    await db.careEntries.update(entry.id, { tasks: updated, updatedAt: Date.now() })
  }

  const doneCount = entry.tasks.filter((t) => t.done).length

  return (
    <div className="entry-card">
      <div className="entry-card-top" onClick={onEdit}>
        <span className="slot-badge">{timeSlot?.label ?? '–'}</span>
        <span className="caretaker-dot" style={{ background: caretaker?.color ?? '#666' }} />
        <span className="entry-card-caretaker">{caretaker?.name ?? '(gelöscht)'}</span>
        {entry.tasks.length > 0 && (
          <span className="entry-card-tasks-summary">
            {doneCount}/{entry.tasks.length}
          </span>
        )}
      </div>
      {entry.mealId && (
        <Link
          to={`/fuetterung/${entry.mealId}`}
          className="meal-chip"
          onClick={(e) => e.stopPropagation()}
        >
          🍽 {meal?.name ?? '(gelöschte Mahlzeit)'}
        </Link>
      )}
      {entry.tasks.length > 0 && (
        <div className="task-chip-list" onClick={(e) => e.stopPropagation()}>
          {entry.tasks.map((t, i) => (
            <label className={`task-chip${t.done ? ' done' : ''}`} key={`${t.label}-${i}`}>
              <input type="checkbox" checked={t.done} onChange={() => toggleTask(i)} />
              {t.label}
            </label>
          ))}
        </div>
      )}
      {entry.note && (
        <div className="entry-card-note">
          <div className="paper-card">{entry.note}</div>
        </div>
      )}
    </div>
  )
}

export default function WeekPage() {
  const { session } = useAuth()
  const { horses, activeHorseId, setActiveHorseId } = useActiveHorse()
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const [formTarget, setFormTarget] = useState<{ dateStr: string; entry?: CareEntry } | null>(null)

  const days = weekDates(weekStart)
  const dateStrs = days.map(toDateStr)
  const dateStrsKey = dateStrs.join(',')
  const today = todayStr()

  const caretakers =
    useLiveQuery(
      () => db.caretakers.orderBy('name').filter((c) => c.horseId === activeHorseId && !c.deletedAt).toArray(),
      [activeHorseId],
    ) ?? []
  const timeSlotDefs =
    useLiveQuery(
      () => db.timeSlotDefs.orderBy('order').filter((t) => t.horseId === activeHorseId && !t.deletedAt).toArray(),
      [activeHorseId],
    ) ?? []
  const meals = useLiveQuery(() => db.meals.toArray(), []) ?? []
  const entries =
    useLiveQuery(
      () =>
        db.careEntries
          .where('dateStr')
          .anyOf(dateStrs)
          .filter((e) => e.horseId === activeHorseId && !e.deletedAt)
          .toArray(),
      [dateStrsKey, activeHorseId],
    ) ?? []

  // Betreuer:innen-Zeilen (über alle Pferde hinweg), die mit dem eigenen Account verknüpft sind
  // (Stern-Markierung, siehe CaretakersSection.tsx) – eine pro Pferd, auf dem man sich selbst so
  // markiert hat.
  const myCaretakerIds =
    useLiveQuery(
      () =>
        session
          ? db.caretakers
              .filter((c) => c.userId === session.user.id && !c.deletedAt)
              .toArray()
          : Promise.resolve([] as Caretaker[]),
      [session?.user.id],
    ) ?? []
  const myCaretakerIdsKey = myCaretakerIds
    .map((c) => c.id)
    .sort()
    .join(',')

  // Für den Hinweis unten: offene Aufgaben heute bei *anderen* Pferden, die einem mit dem
  // eigenen Account verknüpften Betreuer zugeordnet sind – nicht jede offene Aufgabe irgendeiner
  // Person bei irgendeinem anderen Pferd.
  const otherHorseEntriesToday =
    useLiveQuery(
      () =>
        db.careEntries
          .where('dateStr')
          .equals(today)
          .filter(
            (e) =>
              e.horseId !== activeHorseId &&
              !e.deletedAt &&
              myCaretakerIds.some((c) => c.id === e.caretakerId) &&
              e.tasks.some((t) => !t.done),
          )
          .toArray(),
      [activeHorseId, today, myCaretakerIdsKey],
    ) ?? []

  const caretakerById = new Map(caretakers.map((c) => [c.id, c]))
  const timeSlotById = new Map(timeSlotDefs.map((s) => [s.id, s]))
  const timeSlotOrder = new Map(timeSlotDefs.map((s) => [s.id, s.order]))
  const mealById = new Map(meals.map((m) => [m.id, m]))
  const horseNameById = new Map(horses.map((h) => [h.id, h.name]))

  const openTaskCountByHorse = new Map<string, number>()
  for (const entry of otherHorseEntriesToday) {
    const openCount = entry.tasks.filter((t) => !t.done).length
    openTaskCountByHorse.set(entry.horseId, (openTaskCountByHorse.get(entry.horseId) ?? 0) + openCount)
  }

  return (
    <div>
      <h1>Wochenplan</h1>

      <HorseSwitcher />

      {openTaskCountByHorse.size > 0 && (
        <div className="cross-horse-hint">
          {[...openTaskCountByHorse.entries()].map(([horseId, count]) => (
            <button key={horseId} className="cross-horse-hint-item" onClick={() => setActiveHorseId(horseId)}>
              Heute noch offen bei <strong>{horseNameById.get(horseId) ?? '…'}</strong>: {count}{' '}
              {count === 1 ? 'Aufgabe' : 'Aufgaben'}
            </button>
          ))}
        </div>
      )}

      <div className="week-nav">
        <button onClick={() => setWeekStart((w) => addDays(w, -7))} aria-label="Vorherige Woche">
          ‹
        </button>
        <span className="week-nav-range">{formatWeekRange(weekStart)}</span>
        <button onClick={() => setWeekStart((w) => addDays(w, 7))} aria-label="Nächste Woche">
          ›
        </button>
      </div>
      <div className="week-today-row">
        <button className="secondary-button today-button" onClick={() => setWeekStart(startOfWeek(new Date()))}>
          Heute
        </button>
      </div>

      {days.map((day) => {
        const dateStr = toDateStr(day)
        const dayEntries = entries
          .filter((e) => e.dateStr === dateStr)
          .sort((a, b) => (timeSlotOrder.get(a.timeSlotId) ?? 0) - (timeSlotOrder.get(b.timeSlotId) ?? 0))
        const isNewFormOpenHere = formTarget?.dateStr === dateStr && !formTarget.entry

        return (
          <div className="day-group" key={dateStr}>
            <div className="day-group-header">
              <span className={`day-group-title${dateStr === today ? ' today' : ''}`}>
                {formatDayLabel(day)}
              </span>
              <button
                className="add-entry-button"
                onClick={() => setFormTarget({ dateStr })}
                aria-label="Termin hinzufügen"
              >
                +
              </button>
            </div>

            <div className="entry-list">
              {dayEntries.map((entry) =>
                formTarget?.entry?.id === entry.id ? (
                  <CareEntryForm
                    key={entry.id}
                    dateStr={dateStr}
                    caretakers={caretakers}
                    entry={entry}
                    onClose={() => setFormTarget(null)}
                  />
                ) : (
                  <EntryCard
                    key={entry.id}
                    entry={entry}
                    caretaker={caretakerById.get(entry.caretakerId)}
                    timeSlot={timeSlotById.get(entry.timeSlotId)}
                    meal={entry.mealId ? mealById.get(entry.mealId) : undefined}
                    onEdit={() => setFormTarget({ dateStr, entry })}
                  />
                ),
              )}
              {isNewFormOpenHere && (
                <CareEntryForm dateStr={dateStr} caretakers={caretakers} onClose={() => setFormTarget(null)} />
              )}
              {dayEntries.length === 0 && !isNewFormOpenHere && <p className="hint">Noch nichts geplant.</p>}
            </div>
          </div>
        )
      })}
    </div>
  )
}
