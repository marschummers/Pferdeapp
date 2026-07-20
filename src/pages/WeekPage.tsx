import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { db } from '../db/db'
import type { CareEntry, Caretaker, Meal, TimeSlotDef } from '../db/types'
import { addDays, formatDayLabel, formatWeekRange, startOfWeek, toDateStr, todayStr, weekDates } from '../lib/date'
import { useActiveHorse } from '../lib/activeHorse'
import { useAuth } from '../lib/auth'
import CareEntryForm from '../components/CareEntryForm'

// Ein Termin als Zeile im Tages-Zeitstrahl (siehe .day-timeline in App.css) – ersetzt die
// frühere freistehende "Karte pro Termin"-Darstellung durch eine durchgehende Terminleiste
// innerhalb der Tages-Karte. Funktional unverändert: onEdit öffnet weiterhin das Bearbeiten-
// Formular, die Checkbox hakt weiterhin direkt (ohne den Bearbeiten-Modus zu öffnen) ab.
function TimelineEntry({
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
  const progressPercent = entry.tasks.length > 0 ? Math.round((doneCount / entry.tasks.length) * 100) : 0

  return (
    <div className="timeline-row">
      <span className="timeline-node" style={{ background: caretaker?.color ?? '#666' }} />
      <div className="timeline-content">
        <div className="timeline-top" onClick={onEdit}>
          <span className="timeline-slot">{timeSlot?.label ?? '–'}</span>
          <span className="timeline-caretaker">{caretaker?.name ?? '(gelöscht)'}</span>
        </div>

        {entry.tasks.length > 0 && (
          <div className="timeline-progress" aria-label={`${doneCount} von ${entry.tasks.length} erledigt`}>
            <span className="timeline-progress-track">
              <span className="timeline-progress-fill" style={{ width: `${progressPercent}%` }} />
            </span>
            <span className="timeline-progress-count">
              {doneCount}/{entry.tasks.length}
            </span>
          </div>
        )}

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
          <div className="entry-task-list" onClick={(e) => e.stopPropagation()}>
            {entry.tasks.map((t, i) => (
              <label className={`entry-task-chip${t.done ? ' done' : ''}`} key={`${t.label}-${i}`}>
                <input type="checkbox" checked={t.done} onChange={() => toggleTask(i)} />
                {t.label}
              </label>
            ))}
          </div>
        )}

        {entry.note && (
          <div className="entry-card-note">
            <div className="paper-card entry-note-paper">{entry.note}</div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function WeekPage() {
  const { session } = useAuth()
  const { horses, activeHorseId } = useActiveHorse()
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const [formTarget, setFormTarget] = useState<{ dateStr: string; entry?: CareEntry } | null>(null)

  // Das gerade ANGEZEIGTE Pferd – i.d.R. gleich dem für dieses Gerät aktiven Pferd, kann aber
  // über den Cross-Pferd-Hinweis unten auf ein anderes Pferd zeigen, OHNE das aktive Pferd zu
  // wechseln (das bleibt Stammdaten/Fütterung/neuen Terminen an anderer Stelle vorbehalten und
  // wechselt nur bewusst über Verwaltung → Pferd). Springt zurück auf activeHorseId, sobald sich
  // das "echte" aktive Pferd ändert (z.B. nach einem bewussten Wechsel in der Verwaltung).
  const [viewedHorseId, setViewedHorseId] = useState(activeHorseId)
  useEffect(() => {
    setViewedHorseId(activeHorseId)
  }, [activeHorseId])

  const days = weekDates(weekStart)
  const dateStrs = days.map(toDateStr)
  const dateStrsKey = dateStrs.join(',')
  const today = todayStr()

  const caretakers =
    useLiveQuery(
      () => db.caretakers.orderBy('name').filter((c) => c.horseId === viewedHorseId && !c.deletedAt).toArray(),
      [viewedHorseId],
    ) ?? []
  // Über alle Pferde hinweg, für die Cross-Pferd-Zuweisung (siehe otherCaretakers unten) und
  // damit EntryCard auch Betreuer:innen anderer Pferde anzeigen kann.
  const allCaretakers = useLiveQuery(() => db.caretakers.filter((c) => !c.deletedAt).toArray(), []) ?? []
  const timeSlotDefs =
    useLiveQuery(
      () => db.timeSlotDefs.orderBy('order').filter((t) => t.horseId === viewedHorseId && !t.deletedAt).toArray(),
      [viewedHorseId],
    ) ?? []
  const meals = useLiveQuery(() => db.meals.toArray(), []) ?? []
  const entries =
    useLiveQuery(
      () =>
        db.careEntries
          .where('dateStr')
          .anyOf(dateStrs)
          .filter((e) => e.horseId === viewedHorseId && !e.deletedAt)
          .toArray(),
      [dateStrsKey, viewedHorseId],
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

  // Für den Hinweis unten: offene Aufgaben heute bei Pferden AUSSER dem gerade angezeigten, die
  // einem mit dem eigenen Account verknüpften Betreuer zugeordnet sind – nicht jede offene
  // Aufgabe irgendeiner Person bei irgendeinem anderen Pferd. Bezieht sich bewusst auf
  // viewedHorseId statt activeHorseId: schaut man sich (nach Antippen eines Hinweises) den
  // Kalender eines anderen Pferds schon an, braucht es dafür keinen weiteren Hinweis mehr.
  const otherHorseEntriesToday =
    useLiveQuery(
      () =>
        db.careEntries
          .where('dateStr')
          .equals(today)
          .filter(
            (e) =>
              e.horseId !== viewedHorseId &&
              !e.deletedAt &&
              myCaretakerIds.some((c) => c.id === e.caretakerId) &&
              e.tasks.some((t) => !t.done),
          )
          .toArray(),
      [viewedHorseId, today, myCaretakerIdsKey],
    ) ?? []

  // Vor der ersten DB-Auflösung (siehe getCurrentHorseId in db.ts) ist noch kein Pferd bekannt –
  // erst ab hier (nach allen Hooks) darf viewedHorseId als sicher vorhanden behandelt werden.
  if (!activeHorseId || !viewedHorseId) {
    return (
      <div>
        <h1>Wochenplan</h1>
        <p className="hint">Lädt…</p>
      </div>
    )
  }

  // Betreuer:innen anderer angemeldeter Accounts (nicht des angezeigten Pferds), damit man auch
  // vom eigenen Kalender aus Aufgaben an andere Personen vergeben kann (CareEntryForm) – eine
  // Zeile pro Person reicht als Referenz, auch wenn jemand auf mehreren Pferden verknüpft ist.
  const otherCaretakers = (() => {
    const byUserId = new Map<string, Caretaker>()
    for (const c of allCaretakers) {
      if (!c.userId || c.userId === session?.user.id || c.horseId === viewedHorseId) continue
      if (!byUserId.has(c.userId)) byUserId.set(c.userId, c)
    }
    return [...byUserId.values()].sort((a, b) => a.name.localeCompare(b.name))
  })()

  const caretakerById = new Map(allCaretakers.map((c) => [c.id, c]))
  const timeSlotById = new Map(timeSlotDefs.map((s) => [s.id, s]))
  const timeSlotOrder = new Map(timeSlotDefs.map((s) => [s.id, s.order]))
  const mealById = new Map(meals.map((m) => [m.id, m]))
  const horseNameById = new Map(horses.map((h) => [h.id, h.name]))
  // Eigenes Pferd zuerst, Rest alphabetisch – für den Kalender-Picker unten, mit dem man sich
  // (rein zum Nachschauen, ohne das aktive Pferd zu wechseln) den Kalender jedes Pferds ansehen
  // kann, auf das man Zugriff hat.
  const sortedHorses = [...horses].sort((a, b) => {
    if (a.id === activeHorseId) return -1
    if (b.id === activeHorseId) return 1
    return a.name.localeCompare(b.name)
  })

  const openTaskCountByHorse = new Map<string, number>()
  for (const entry of otherHorseEntriesToday) {
    const openCount = entry.tasks.filter((t) => !t.done).length
    openTaskCountByHorse.set(entry.horseId, (openTaskCountByHorse.get(entry.horseId) ?? 0) + openCount)
  }

  return (
    <div>
      <h1>Wochenplan</h1>

      {openTaskCountByHorse.size > 0 && (
        <div className="cross-horse-hint">
          {[...openTaskCountByHorse.entries()].map(([horseId, count]) => (
            <button key={horseId} className="cross-horse-hint-item" onClick={() => setViewedHorseId(horseId)}>
              Heute noch offen bei <strong>{horseNameById.get(horseId) ?? '…'}</strong>: {count}{' '}
              {count === 1 ? 'Aufgabe' : 'Aufgaben'}
            </button>
          ))}
        </div>
      )}

      {sortedHorses.length > 1 && (
        <div className="week-horse-picker">
          {sortedHorses.map((horse) => (
            <button
              key={horse.id}
              className={`week-horse-pill${horse.id === viewedHorseId ? ' active' : ''}`}
              onClick={() => setViewedHorseId(horse.id)}
            >
              {horse.id === activeHorseId && (
                <span className="week-horse-pill-home" title="Dein Pferd auf diesem Gerät">
                  ★
                </span>
              )}
              {horse.name}
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
        const isToday = dateStr === today
        // Rein für die Typografie (großes Tagesmedaillon mit Zahl, Wochentag, Monat getrennt)
        // in drei Teile zerlegt – formatDayLabel liefert weiterhin denselben einen String wie
        // bisher, hier wird nur dessen Darstellung aufgeteilt.
        const [weekday, dayMonth] = formatDayLabel(day).split(', ')
        const [dayNumber, monthName] = dayMonth.split('. ')

        return (
          <div className={`day-card${isToday ? ' today' : ''}`} key={dateStr}>
            <div className="day-card-header">
              <div className="day-card-heading">
                <span className="day-medallion">{dayNumber}</span>
                <span className="day-heading-text">
                  <span className="day-weekday">{weekday}</span>
                  <span className="day-month">{monthName}</span>
                </span>
              </div>
              <button
                className="add-entry-button"
                onClick={() => setFormTarget({ dateStr })}
                aria-label="Termin hinzufügen"
              >
                +
              </button>
            </div>

            <div className="day-timeline">
              {dayEntries.map((entry) =>
                formTarget?.entry?.id === entry.id ? (
                  <CareEntryForm
                    key={entry.id}
                    horseId={viewedHorseId}
                    dateStr={dateStr}
                    caretakers={caretakers}
                    otherCaretakers={otherCaretakers}
                    entry={entry}
                    onClose={() => setFormTarget(null)}
                  />
                ) : (
                  <TimelineEntry
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
                <CareEntryForm
                  horseId={viewedHorseId}
                  dateStr={dateStr}
                  caretakers={caretakers}
                  otherCaretakers={otherCaretakers}
                  onClose={() => setFormTarget(null)}
                />
              )}
              {dayEntries.length === 0 && !isNewFormOpenHere && (
                <div className="timeline-row timeline-row-empty">
                  <span className="timeline-node ghost" />
                  <p className="hint timeline-empty-text">Noch nichts geplant.</p>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
