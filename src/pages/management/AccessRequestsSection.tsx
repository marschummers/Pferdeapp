import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

interface PendingProfile {
  id: string
  email: string
  created_at: string
}

// Warteliste für neu angemeldete, aber noch nicht freigegebene Accounts (siehe profiles.approved
// in supabase/schema.sql). Fragt direkt Supabase ab statt über Dexie/lib/sync.ts, da `profiles`
// bewusst nicht lokal gespiegelt wird – nur der Admin sieht diese Ansicht überhaupt
// (Sichtbarkeit wird bereits in ManagementPage.tsx geprüft, hier zusätzlich durch die
// RLS-Policy "profiles: admin reads all" abgesichert).
export default function AccessRequestsSection() {
  const [pending, setPending] = useState<PendingProfile[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function load() {
    if (!supabase) return
    const { data, error: fetchError } = await supabase
      .from('profiles')
      .select('id, email, created_at')
      .eq('approved', false)
      .order('created_at', { ascending: true })
    if (fetchError) {
      setError(fetchError.message)
      return
    }
    setError(null)
    setPending(data ?? [])
  }

  useEffect(() => {
    load()
  }, [])

  async function approve(id: string) {
    if (!supabase) return
    setBusyId(id)
    const { error: updateError } = await supabase.from('profiles').update({ approved: true }).eq('id', id)
    setBusyId(null)
    if (updateError) {
      setError(updateError.message)
      return
    }
    await load()
  }

  return (
    <div>
      <p className="hint">
        Neue Anmeldungen landen hier, bis du sie freigibst. Danach sieht die Person trotzdem noch kein Pferd,
        sondern muss sich zusätzlich mit einem Beitritts-Code verbinden (Tab „Pferd“).
      </p>
      {error && <p className="sync-bar-error">{error}</p>}
      <div className="card-list">
        {pending?.length === 0 && <p className="empty-state">Keine offenen Anfragen.</p>}
        {pending?.map((p) => (
          <div className="caretaker-card" key={p.id}>
            <span className="caretaker-card-name">{p.email}</span>
            <button className="primary-button" onClick={() => approve(p.id)} disabled={busyId === p.id}>
              {busyId === p.id ? '…' : 'Freigeben'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
