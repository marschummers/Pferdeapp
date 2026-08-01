import { useState } from 'react'
import { db, newHorseJoinCode } from '../../db/db'
import { useActiveHorse } from '../../lib/activeHorse'
import { useAuth, ADMIN_EMAIL } from '../../lib/auth'
import { supabase } from '../../lib/supabaseClient'
import type { Horse } from '../../db/types'
import GroupsSection from './GroupsSection'

interface HorseMember {
  id: string
  email: string
}

export default function HorseSection() {
  const { session } = useAuth()
  const { horses, activeHorseId, setActiveHorseId } = useActiveHorse()

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')

  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')

  const [joinCodeInput, setJoinCodeInput] = useState('')
  const [joining, setJoining] = useState(false)
  const [joinMessage, setJoinMessage] = useState<{ text: string; isError: boolean } | null>(null)

  const [unfollowingId, setUnfollowingId] = useState<string | null>(null)
  const [unfollowError, setUnfollowError] = useState<string | null>(null)

  const [membersHorseId, setMembersHorseId] = useState<string | null>(null)
  const [members, setMembers] = useState<HorseMember[] | null>(null)
  const [membersError, setMembersError] = useState<string | null>(null)
  const [memberBusyId, setMemberBusyId] = useState<string | null>(null)

  function isOwner(horse: Horse): boolean {
    return horse.ownerId !== undefined && horse.ownerId === session?.user.id
  }

  // Umbenennen/Löschen ist Besitzer:in + festem Admin-Account vorbehalten (siehe
  // migrations/0017) – wer nur folgt, kann sich stattdessen selbst austragen (unfollowHorse).
  function canManage(horse: Horse): boolean {
    return isOwner(horse) || session?.user.email === ADMIN_EMAIL
  }

  async function handleJoin() {
    const code = joinCodeInput.trim()
    if (!code || !supabase) return
    setJoining(true)
    setJoinMessage(null)
    const { data, error } = await supabase.rpc('join_horse_by_code', { code })
    setJoining(false)
    if (error) {
      setJoinMessage({ text: error.message, isError: true })
      return
    }
    setJoinCodeInput('')
    setJoinMessage({ text: `Du folgst jetzt „${data}“ – nach dem nächsten Sync sichtbar.`, isError: false })
  }

  // "Entfolgen": eigene Mitgliedschaft entfernen, ohne dass die Besitzer:in etwas tun muss
  // (RLS-Policy "horse_members: self removes", siehe migrations/0017). Danach sofort lokal
  // aufräumen statt auf den nächsten Sync zu warten – gleiche Kaskade wie beim Löschen, nur
  // ohne serverseitige Löschung (die Besitzer:in behält das Pferd ja weiterhin).
  async function unfollowHorse(horse: Horse) {
    if (!supabase || !session) return
    setUnfollowingId(horse.id)
    setUnfollowError(null)
    const { error } = await supabase
      .from('horse_members')
      .delete()
      .eq('horse_id', horse.id)
      .eq('user_id', session.user.id)
    setUnfollowingId(null)
    if (error) {
      setUnfollowError(error.message)
      return
    }
    await db.transaction(
      'rw',
      db.horses,
      db.caretakers,
      db.taskDefs,
      db.timeSlotDefs,
      db.careEntries,
      async () => {
        await db.horses.delete(horse.id)
        await db.caretakers.where('horseId').equals(horse.id).delete()
        await db.taskDefs.where('horseId').equals(horse.id).delete()
        await db.timeSlotDefs.where('horseId').equals(horse.id).delete()
        await db.careEntries.where('horseId').equals(horse.id).delete()
      },
    )
  }

  async function regenerateJoinCode(horse: Horse) {
    await db.horses.update(horse.id, { joinCode: newHorseJoinCode(), updatedAt: Date.now() })
  }

  async function loadMembers(horse: Horse) {
    if (membersHorseId === horse.id) {
      setMembersHorseId(null)
      return
    }
    setMembersHorseId(horse.id)
    setMembers(null)
    setMembersError(null)
    if (!supabase) return
    const { data: memberRows, error: memberError } = await supabase
      .from('horse_members')
      .select('user_id')
      .eq('horse_id', horse.id)
    if (memberError) {
      setMembersError(memberError.message)
      return
    }
    const userIds = (memberRows ?? []).map((r) => r.user_id as string)
    if (userIds.length === 0) {
      setMembers([])
      return
    }
    const { data: profileRows, error: profileError } = await supabase
      .from('profiles')
      .select('id, email')
      .in('id', userIds)
    if (profileError) {
      setMembersError(profileError.message)
      return
    }
    setMembers((profileRows ?? []) as HorseMember[])
  }

  async function removeMember(horse: Horse, userId: string) {
    if (!supabase) return
    setMemberBusyId(userId)
    const { error } = await supabase.from('horse_members').delete().eq('horse_id', horse.id).eq('user_id', userId)
    setMemberBusyId(null)
    if (error) {
      setMembersError(error.message)
      return
    }
    setMembers((prev) => prev?.filter((m) => m.id !== userId) ?? null)
  }

  function startEdit(horse: Horse) {
    setEditingId(horse.id)
    setEditingName(horse.name)
  }

  async function saveEdit() {
    const trimmed = editingName.trim()
    if (!trimmed || !editingId) return
    await db.horses.update(editingId, { name: trimmed, updatedAt: Date.now() })
    setEditingId(null)
  }

  function startDelete(horse: Horse) {
    setDeletingId(horse.id)
    setDeleteConfirmText('')
  }

  async function confirmDelete(horse: Horse) {
    if (deleteConfirmText.trim() !== horse.name) return
    const now = Date.now()
    // Weiches Löschen kaskadiert von Hand auf alle zugehörigen Zeilen (kein Fremdschlüssel-
    // Cascade, da wir nie hart löschen, siehe lib/sync.ts) – sonst blieben Termine/Betreuer:innen
    // eines gelöschten Pferds als Karteileichen aktiv liegen.
    await db.transaction(
      'rw',
      db.horses,
      db.caretakers,
      db.taskDefs,
      db.timeSlotDefs,
      db.careEntries,
      async () => {
        await db.horses.update(horse.id, { deletedAt: now, updatedAt: now })
        await db.caretakers.where('horseId').equals(horse.id).modify({ deletedAt: now, updatedAt: now })
        await db.taskDefs.where('horseId').equals(horse.id).modify({ deletedAt: now, updatedAt: now })
        await db.timeSlotDefs.where('horseId').equals(horse.id).modify({ deletedAt: now, updatedAt: now })
        await db.careEntries.where('horseId').equals(horse.id).modify({ deletedAt: now, updatedAt: now })
      },
    )
    setDeletingId(null)
  }

  const deletingHorse = horses.find((h) => h.id === deletingId)

  return (
    <div>
      <div className="edit-panel horse-join-panel">
        <h3>Pferd folgen</h3>
        <p className="hint">Code von der Person, die das Pferd verwaltet, eingeben.</p>
        <div className="field-row">
          <div className="field">
            <input
              value={joinCodeInput}
              onChange={(e) => setJoinCodeInput(e.target.value)}
              placeholder="z.B. A1B2C3"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleJoin()
                }
              }}
            />
          </div>
          <button className="primary-button" onClick={handleJoin} disabled={!joinCodeInput.trim() || joining}>
            {joining ? '…' : 'Folgen'}
          </button>
        </div>
        {joinMessage && (
          <p className={joinMessage.isError ? 'sync-bar-error' : 'hint'}>{joinMessage.text}</p>
        )}
      </div>

      <p className="hint">
        Alle Pferde, auf die du Zugriff hast. Umbenennen/Löschen kann nur, wem das Pferd gehört
        (Löschen entfernt dann auch alle zugehörigen Termine, Betreuer:innen, Aufgaben und
        Zeitfenster – für alle, die mitsynchronisieren). Folgst du nur, kannst du dich stattdessen
        jederzeit selbst entfolgen.
      </p>

      <div className="card-list">
        {horses.map((horse) => (
          <div className="horse-manage-card" key={horse.id}>
            <div className="horse-manage-card-row">
              {editingId === horse.id ? (
                <>
                  <input
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        saveEdit()
                      }
                    }}
                    autoFocus
                  />
                  <button className="icon-button" onClick={saveEdit} aria-label="Speichern">
                    ✓
                  </button>
                </>
              ) : (
                <>
                  <span className="horse-manage-name">
                    🐴 {horse.name}
                    {horse.id === activeHorseId && <span className="horse-manage-active-badge">aktiv</span>}
                  </span>
                  {canManage(horse) && (
                    <>
                      <button className="icon-button" onClick={() => startEdit(horse)} aria-label="Umbenennen">
                        ✎
                      </button>
                      <button className="icon-button" onClick={() => startDelete(horse)} aria-label="Löschen">
                        ✕
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
            {/* Bewusst kein Ein-Klick-Umschalter auf der Hauptseite – welches Pferd auf diesem
                Gerät "aktiv" ist (bestimmt u.a., wo neue Termine landen), wechselt nur hier
                über einen expliziten Button. */}
            {horse.id !== activeHorseId && editingId !== horse.id && (
              <button
                className="secondary-button horse-activate-button"
                onClick={() => setActiveHorseId(horse.id)}
              >
                Für dieses Gerät verwenden
              </button>
            )}

            {!isOwner(horse) && (
              <>
                <button
                  className="secondary-button horse-unfollow-button"
                  onClick={() => unfollowHorse(horse)}
                  disabled={unfollowingId === horse.id}
                >
                  {unfollowingId === horse.id ? '…' : 'Entfolgen'}
                </button>
                {unfollowError && <p className="sync-bar-error">{unfollowError}</p>}
              </>
            )}

            {isOwner(horse) && (
              <div className="horse-owner-tools">
                <div className="horse-join-code-row">
                  <span className="horse-join-code-label">Beitritts-Code</span>
                  <span className="horse-join-code-value">{horse.joinCode || '…'}</span>
                  <button className="secondary-button" onClick={() => regenerateJoinCode(horse)}>
                    Neu erzeugen
                  </button>
                </div>
                <button className="secondary-button" onClick={() => loadMembers(horse)}>
                  {membersHorseId === horse.id ? 'Mitglieder ausblenden' : 'Mitglieder anzeigen'}
                </button>
                {membersHorseId === horse.id && (
                  <div className="horse-members-list">
                    {membersError && <p className="sync-bar-error">{membersError}</p>}
                    {!membersError && members === null && <p className="hint">Lädt…</p>}
                    {!membersError && members?.length === 0 && (
                      <p className="hint">Noch niemand über den Code beigetreten.</p>
                    )}
                    {members?.map((member) => (
                      <div className="horse-member-row" key={member.id}>
                        <span>{member.email}</span>
                        <button
                          className="icon-button"
                          onClick={() => removeMember(horse, member.id)}
                          disabled={memberBusyId === member.id}
                          aria-label={`${member.email} entfernen`}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <GroupsSection />

      {deletingHorse && (
        <div className="edit-panel horse-delete-confirm">
          <h3>„{deletingHorse.name}“ wirklich löschen?</h3>
          <p className="hint">
            Löscht auch alle Termine, Betreuer:innen, Aufgaben und Zeitfenster dieses Pferds – für alle, die
            mitsynchronisieren. Das kann nicht rückgängig gemacht werden. Tippe zur Bestätigung den Namen „
            {deletingHorse.name}“ ein:
          </p>
          <div className="field">
            <input
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder={deletingHorse.name}
              autoFocus
            />
          </div>
          <div className="edit-panel-actions">
            <button className="secondary-button" onClick={() => setDeletingId(null)}>
              Abbrechen
            </button>
            <button
              className="primary-button horse-delete-button"
              onClick={() => confirmDelete(deletingHorse)}
              disabled={deleteConfirmText.trim() !== deletingHorse.name}
            >
              Endgültig löschen
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
