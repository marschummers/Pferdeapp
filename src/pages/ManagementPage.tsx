import { useState } from 'react'
import { db } from '../db/db'
import CaretakersSection from './management/CaretakersSection'
import IngredientsSection from './management/IngredientsSection'
import OrderedDefList from '../components/OrderedDefList'

type Tab = 'betreuer' | 'aufgaben' | 'zeitfenster' | 'zutaten'

export default function ManagementPage() {
  const [tab, setTab] = useState<Tab>('betreuer')

  return (
    <div>
      <h1>Verwaltung</h1>

      <div className="sub-tabs">
        <button className={tab === 'betreuer' ? 'active' : ''} onClick={() => setTab('betreuer')}>
          Betreuer:innen
        </button>
        <button className={tab === 'aufgaben' ? 'active' : ''} onClick={() => setTab('aufgaben')}>
          Aufgaben
        </button>
        <button className={tab === 'zeitfenster' ? 'active' : ''} onClick={() => setTab('zeitfenster')}>
          Zeitfenster
        </button>
        <button className={tab === 'zutaten' ? 'active' : ''} onClick={() => setTab('zutaten')}>
          Zutaten
        </button>
      </div>

      {tab === 'betreuer' && <CaretakersSection />}

      {tab === 'aufgaben' && (
        <>
          <p className="hint">
            Diese Aufgaben werden bei neuen Terminen automatisch vorgeschlagen. Du kannst pro Termin trotzdem
            jederzeit weitere hinzufügen.
          </p>
          <OrderedDefList
            table={db.taskDefs}
            placeholder="Neue Aufgabe…"
            emptyHint="Noch keine Aufgaben angelegt."
            deleteConfirm={(label) => `Aufgabe „${label}“ löschen? Bereits geplante Termine behalten sie weiterhin.`}
          />
        </>
      )}

      {tab === 'zeitfenster' && (
        <>
          <p className="hint">Die Reihenfolge hier bestimmt, wie die Zeitfenster im Wochenplan sortiert werden.</p>
          <OrderedDefList
            table={db.timeSlotDefs}
            placeholder="Neues Zeitfenster…"
            emptyHint="Noch keine Zeitfenster angelegt."
            deleteConfirm={(label) =>
              `Zeitfenster „${label}“ löschen? Termine, die es nutzen, zeigen dann kein Zeitfenster mehr an.`
            }
          />
        </>
      )}

      {tab === 'zutaten' && <IngredientsSection />}
    </div>
  )
}
