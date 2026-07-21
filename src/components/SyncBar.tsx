import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../lib/auth'
import { syncAll } from '../lib/sync'

const LAST_SYNCED_KEY = 'stallplaner-last-synced-at'
const AUTO_SYNC_INTERVAL_MS = 5 * 60 * 1000

export default function SyncBar() {
  const { configured, session, signOut } = useAuth()
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(() => {
    const stored = localStorage.getItem(LAST_SYNCED_KEY)
    return stored ? Number(stored) : null
  })
  // Verhindert überlappende Sync-Läufe zwischen den automatischen Auslösern (Vordergrund-Wechsel
  // + Intervall, siehe Effekt unten) – eine Ref statt des `syncing`-States, weil deren
  // Callbacks sonst einen veralteten Stand aus dem Erstellungszeitpunkt des Effekts sähen.
  const syncingRef = useRef(false)

  const runSync = useCallback(async (silent: boolean) => {
    if (syncingRef.current) return
    syncingRef.current = true
    setSyncing(true)
    try {
      await syncAll()
      const now = Date.now()
      localStorage.setItem(LAST_SYNCED_KEY, String(now))
      setLastSyncedAt(now)
      setError(null)
    } catch (e) {
      // Automatische Versuche (Vordergrund-Wechsel/Intervall) scheitern bewusst still, z.B. bei
      // schlechtem Empfang im Stall – nur der manuelle Button zeigt eine Fehlermeldung an.
      if (!silent) setError(e instanceof Error ? e.message : 'Sync fehlgeschlagen.')
    } finally {
      syncingRef.current = false
      setSyncing(false)
    }
  }, [])

  // Automatischer Sync: sofort beim Öffnen/Zurückkehren zur App (Sichtbarkeits-Wechsel) und
  // danach alle 5 Minuten, solange sie offen im Vordergrund bleibt. `session?.user.id` statt
  // der ganzen `session` als Abhängigkeit, damit ein stiller Token-Refresh im Hintergrund den
  // Timer nicht unnötig neu startet.
  useEffect(() => {
    if (!configured || !session) return

    runSync(true)

    function handleVisibility() {
      if (document.visibilityState === 'visible') runSync(true)
    }
    document.addEventListener('visibilitychange', handleVisibility)

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') runSync(true)
    }, AUTO_SYNC_INTERVAL_MS)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      clearInterval(interval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configured, session?.user.id, runSync])

  if (!configured || !session) return null

  async function handleSync() {
    await runSync(false)
  }

  return (
    <div className="sync-bar">
      <div className="sync-bar-account">
        <span className="sync-bar-email">{session.user.email}</span>
        <button className="sync-bar-signout" onClick={() => signOut()}>
          Abmelden
        </button>
      </div>
      <button className="secondary-button sync-button" onClick={handleSync} disabled={syncing}>
        {syncing ? 'Synchronisiere…' : 'Jetzt synchronisieren'}
      </button>
      {error && <p className="sync-bar-error">{error}</p>}
      {!error && lastSyncedAt && (
        <p className="sync-bar-status">Zuletzt synchronisiert: {new Date(lastSyncedAt).toLocaleString('de-DE')}</p>
      )}
    </div>
  )
}
