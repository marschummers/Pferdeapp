import { useEffect, useState } from 'react'
import { useAuth } from './auth'
import { supabase } from './supabaseClient'

export interface HorseClassification {
  isOwn: boolean
  isFollowed: boolean
  isFavorite: boolean
  viaGroupName: string | null
}

// Über alle Pferde hinweg: eigenes/gefolgt/favorisiert/über welche Gruppe sichtbar – wird
// serverseitig berechnet (my_horses()-RPC, siehe supabase/schema.sql), da die Mitgliedschafts-/
// Gruppen-Verknüpfung nicht lokal gespiegelt wird. Gemeinsam genutzt von HorseSection.tsx
// (Kategorien-Akkordeon) und WeekPage.tsx (Favoriten-Leiste + Dropdown für den Rest).
export function useHorseClassifications() {
  const { session } = useAuth()
  const [classifications, setClassifications] = useState<Map<string, HorseClassification>>(new Map())
  const [error, setError] = useState<string | null>(null)

  async function reload() {
    if (!supabase) return
    const { data, error: rpcError } = await supabase.rpc('my_horses')
    if (rpcError) {
      // Bewusst sichtbar statt still zu verschlucken: eine fehlschlagende Einordnung fällt sonst
      // unbemerkt auf den lokalen Notfall-Wert zurück (siehe classify()-Nutzung in den
      // Komponenten), was wie ein ganz anderer Bug aussieht.
      setError(rpcError.message)
      return
    }
    setError(null)
    const map = new Map<string, HorseClassification>()
    for (const row of data ?? []) {
      map.set(row.horse_id, {
        isOwn: row.is_own,
        isFollowed: row.is_followed,
        isFavorite: row.is_favorite,
        viaGroupName: row.via_group_name,
      })
    }
    setClassifications(map)
  }

  useEffect(() => {
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id])

  return { classifications, error, reload }
}
