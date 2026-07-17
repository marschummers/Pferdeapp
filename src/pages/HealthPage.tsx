import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { HEALTH_CATEGORIES, HEALTH_CATEGORY_LABELS, type HealthCategory } from '../db/types'
import { formatShortDate } from '../lib/date'
import HealthRowIcon from '../components/HealthRowIcon'

export default function HealthPage() {
  const latestWeight = useLiveQuery(() => db.weightEntries.orderBy('dateStr').last(), [])
  const healthEvents = useLiveQuery(() => db.healthEvents.toArray(), []) ?? []

  function summaryFor(category: HealthCategory): string {
    const entries = healthEvents.filter((e) => e.category === category)
    if (entries.length === 0) return 'Noch keine Einträge'
    const upcoming = entries
      .filter((e) => e.nextDueDateStr)
      .sort((a, b) => a.nextDueDateStr!.localeCompare(b.nextDueDateStr!))[0]
    if (upcoming) return `nächste: ${formatShortDate(upcoming.nextDueDateStr!)}`
    const latest = [...entries].sort((a, b) => b.dateStr.localeCompare(a.dateStr))[0]
    return `zuletzt: ${formatShortDate(latest.dateStr)}`
  }

  return (
    <div>
      <h1>Gesundheit</h1>

      <div className="card-list">
        <Link to="/gesundheit/gewicht" className="health-row">
          <span className="health-icon-badge">
            <HealthRowIcon name="weight" />
          </span>
          <span className="health-row-info">
            <span className="health-row-title">Gewicht</span>
            <span className="health-row-subtitle">
              {latestWeight ? `letzte Eintragung: ${formatShortDate(latestWeight.dateStr)}` : 'Noch keine Einträge'}
            </span>
          </span>
          {latestWeight && <span className="health-row-value">{latestWeight.weightKg} kg</span>}
          <span className="health-row-chevron">›</span>
        </Link>

        {HEALTH_CATEGORIES.map((category) => (
          <Link to={`/gesundheit/${category}`} className="health-row" key={category}>
            <span className="health-icon-badge">
              <HealthRowIcon name={category} />
            </span>
            <span className="health-row-info">
              <span className="health-row-title">{HEALTH_CATEGORY_LABELS[category]}</span>
              <span className="health-row-subtitle">{summaryFor(category)}</span>
            </span>
            <span className="health-row-chevron">›</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
