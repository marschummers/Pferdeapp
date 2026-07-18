import { useAuth } from '../lib/auth'
import { useActiveHorse } from '../lib/activeHorse'

// Zeigt nichts, solange nur ein Pferd lokal bekannt ist (Normalfall) – erscheint erst, sobald
// via Sync ein weiteres Pferd lokal bekannt ist (jeder angemeldete Account sieht alle Pferde).
export default function HorseSwitcher() {
  const { session } = useAuth()
  const { horses, activeHorseId, setActiveHorseId } = useActiveHorse()

  if (horses.length < 2) return null

  const sorted = [...horses].sort((a, b) => {
    const aMine = a.ownerId === session?.user.id ? 0 : 1
    const bMine = b.ownerId === session?.user.id ? 0 : 1
    if (aMine !== bMine) return aMine - bMine
    return a.name.localeCompare(b.name)
  })

  return (
    <div className="horse-switcher">
      {sorted.map((horse) => (
        <button
          key={horse.id}
          className={`horse-switcher-pill${horse.id === activeHorseId ? ' active' : ''}`}
          onClick={() => setActiveHorseId(horse.id)}
        >
          🐴 {horse.name}
        </button>
      ))}
    </div>
  )
}
