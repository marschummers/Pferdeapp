import { useState } from 'react'
import { useAuth } from '../lib/auth'
import { syncAll } from '../lib/sync'

const LAST_SYNCED_KEY = 'stallplaner-last-synced-at'

export default function SyncBar() {
  const { configured, session, signOut } = useAuth()
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(() => {
    const stored = localStorage.getItem(LAST_SYNCED_KEY)
    return stored ? Number(stored) : null
  })

  if (!configured || !session) return null

  async function handleSync() {
    setSyncing(true)
    setError(null)
    try {
      await syncAll()
      const now = Date.now()
      localStorage.setItem(LAST_SYNCED_KEY, String(now))
      setLastSyncedAt(now)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sync fehlgeschlagen.')
    } finally {
      setSyncing(false)
    }
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
