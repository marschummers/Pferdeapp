import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, CURRENT_HORSE_ID_KEY, setCurrentHorseId } from '../db/db'
import type { Horse } from '../db/types'

interface ActiveHorseState {
  // Alle lokal bekannten Pferde (jeder angemeldete Account sieht über Sync alle Pferde, siehe
  // schema.sql). Wird u.a. vom HorseSwitcher genutzt.
  horses: Horse[]
  activeHorseId: string | null
  activeHorse: Horse | null
  setActiveHorseId: (id: string) => void
}

const ActiveHorseContext = createContext<ActiveHorseState | null>(null)

export function ActiveHorseProvider({ children }: { children: ReactNode }) {
  const horses = useLiveQuery(() => db.horses.filter((h) => !h.deletedAt).toArray(), []) ?? []
  const [activeHorseId, setActiveHorseIdState] = useState<string | null>(() =>
    localStorage.getItem(CURRENT_HORSE_ID_KEY),
  )

  // Fällt auf das erste bekannte Pferd zurück, falls noch keine Auswahl getroffen wurde (z.B.
  // ganz frische Installation) oder das zuvor gewählte Pferd lokal nicht mehr existiert.
  useEffect(() => {
    if (horses.length === 0) return
    const stillValid = activeHorseId !== null && horses.some((h) => h.id === activeHorseId)
    if (!stillValid) {
      const fallbackId = horses[0].id
      setCurrentHorseId(fallbackId)
      setActiveHorseIdState(fallbackId)
    }
  }, [horses, activeHorseId])

  function setActiveHorseId(id: string) {
    setCurrentHorseId(id)
    setActiveHorseIdState(id)
  }

  const activeHorse = horses.find((h) => h.id === activeHorseId) ?? null

  return (
    <ActiveHorseContext.Provider value={{ horses, activeHorseId, activeHorse, setActiveHorseId }}>
      {children}
    </ActiveHorseContext.Provider>
  )
}

export function useActiveHorse(): ActiveHorseState {
  const ctx = useContext(ActiveHorseContext)
  if (!ctx) throw new Error('useActiveHorse muss innerhalb von ActiveHorseProvider verwendet werden')
  return ctx
}
