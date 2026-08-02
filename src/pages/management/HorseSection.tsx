import { useState } from 'react'
import { db, newHorseJoinCode } from '../../db/db'
import { useActiveHorse } from '../../lib/activeHorse'
import { useAuth, ADMIN_EMAIL } from '../../lib/auth'
import { supabase } from '../../lib/supabaseClient'
import { useHorseClassifications, type HorseClassification } from '../../lib/horseClassifications'
import type { Horse } from '../../db/types'
import GroupsSection from './GroupsSection'

interface HorseMember {
  id: string
  email: string
}

const UNCLASSIFIED_FALLBACK: HorseClassification = {
  isOwn: false,
  isFollowed: true,
  isFavorite: false,
  viaGroupName: null,
}

type CategoryKey = 'favoriten' | 'gefolgt' | 'gruppen'

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

  const [favoriteBusyId, setFavoriteBusyId] = useState<string | null>(null)
  const [favoriteError, setFavoriteError] = useState<string | null>(null)

  const [membersHorseId, setMembersHorseId] = useState<string | null>(null)
  const [members, setMembers] = useState<HorseMember[] | null>(null)
  const [membersError, setMembersError] = useState<string | null>(null)
  const [memberBusyId, setMemberBusyId] = useState<string | null>(null)

  // Über alle Pferde hinweg: eigenes/gefolgt/favorisiert/über welche Gruppe sichtbar – siehe
  // lib/horseClassifications.ts (gemeinsam mit WeekPage.tsx genutzt).
  const { classifications, error: classificationError, reload: loadClassifications } = useHorseClassifications()

  const [expandedCategory, setExpandedCategory] = useState<CategoryKey | null>(null)
  const [expandedHorseId, setExpandedHorseId] = useState<string | null>(null)

  // Solange die Einordnung noch nicht geladen ist (z.B. offline direkt nach dem Öffnen), fällt
  // ein fremdes Pferd übergangsweise unter "Einzeln gefolgt" statt komplett zu verschwinden –
  // das eigene Pferd bleibt dank des rein lokalen ownerId-Felds zuverlässig erkennbar.
  function classify(horse: Horse): HorseClassification {
    const known = classifications.get(horse.id)
    if (known) return known
    if (horse.ownerId !== undefined && horse.ownerId === session?.user.id) {
      return { isOwn: true, isFollowed: false, isFavorite: false, viaGroupName: null }
    }
    return UNCLASSIFIED_FALLBACK
  }

  function isOwner(horse: Horse): boolean {
    return horse.ownerId !== undefined && horse.ownerId === session?.user.id
  }

  // Bewusst NICHT einfach `!isOwner(horse)`: solange ownerId lokal noch unbekannt ist (z.B. kurz
  // nach dem allerersten Sync eines Geräts), darf "Entfolgen" nicht angezeigt werden – sonst
  // könnte man versehentlich sein EIGENES, nur noch nicht als solches erkanntes Pferd lokal
  // entfernen (genau das ist einmal passiert). Nur anzeigen, wenn wirklich sicher ist, dass es
  // NICHT das eigene Pferd ist.
  function isKnownNotOwner(horse: Horse): boolean {
    return horse.ownerId !== undefined && horse.ownerId !== session?.user.id
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
    await loadClassifications()
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
    await loadClassifications()
  }

  async function toggleFavorite(horse: Horse, isFavorite: boolean) {
    if (!supabase || !session) return
    setFavoriteBusyId(horse.id)
    setFavoriteError(null)
    const { error } = isFavorite
      ? await supabase.from('horse_favorites').delete().eq('horse_id', horse.id).eq('user_id', session.user.id)
      : await supabase.from('horse_favorites').insert({ horse_id: horse.id, user_id: session.user.id })
    setFavoriteBusyId(null)
    if (error) {
      setFavoriteError(error.message)
      return
    }
    await loadClassifications()
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
    await loadClassifications()
  }

  const deletingHorse = horses.find((h) => h.id === deletingId)

  const ownHorses: Horse[] = []
  const favoriteHorses: Horse[] = []
  const followedHorses: Horse[] = []
  const groupHorses: Horse[] = []
  for (const horse of horses) {
    const c = classify(horse)
    if (c.isOwn) ownHorses.push(horse)
    else if (c.isFavorite) favoriteHorses.push(horse)
    else if (c.isFollowed) followedHorses.push(horse)
    else groupHorses.push(horse)
  }

  // Der komplette Detail-Bereich eines Pferds (Umbenennen/Löschen, Aktiv-Umschalter, Entfolgen
  // bzw. Gruppen-Hinweis, Besitzer-Werkzeuge) – wird sowohl für "Mein Pferd" oben (immer offen,
  // dort mit Namen: showNameRow=true) als auch für aufgeklappte Zeilen in den drei Kategorien
  // darunter verwendet (dort ohne Namen: die zugeklappte Zeile zeigt ihn schon).
  function renderHorseDetail(horse: Horse, c: HorseClassification, showNameRow = true) {
    return (
      <div className="horse-manage-card">
        {(showNameRow || canManage(horse) || editingId === horse.id) && (
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
                {showNameRow && (
                  <span className="horse-manage-name">
                    🐴 {horse.name}
                    {horse.id === activeHorseId && <span className="horse-manage-active-badge">aktiv</span>}
                  </span>
                )}
                {canManage(horse) && (
                  <>
                    {!showNameRow && <span className="horse-manage-name-spacer" />}
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
        )}
        {/* Bewusst kein Ein-Klick-Umschalter auf der Hauptseite – welches Pferd auf diesem
            Gerät "aktiv" ist (bestimmt u.a., wo neue Termine landen), wechselt nur hier
            über einen expliziten Button. */}
        {horse.id !== activeHorseId && editingId !== horse.id && (
          <button className="secondary-button horse-activate-button" onClick={() => setActiveHorseId(horse.id)}>
            Für dieses Gerät verwenden
          </button>
        )}

        {isKnownNotOwner(horse) && c.isFollowed && (
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

        {isKnownNotOwner(horse) && !c.isFollowed && c.viaGroupName && (
          <p className="hint">
            Um dieses Pferd nicht mehr zu sehen, verlasse die Gruppe <strong>{c.viaGroupName}</strong> (Verwaltung →
            Pferd → unten).
          </p>
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
    )
  }

  function renderCategory(key: CategoryKey, label: string, list: Horse[]) {
    const isExpanded = expandedCategory === key
    return (
      <div className="horse-category">
        <button className="horse-category-header" onClick={() => setExpandedCategory(isExpanded ? null : key)}>
          <span>
            {label} ({list.length})
          </span>
          <span className="horse-category-chevron">{isExpanded ? '▾' : '▸'}</span>
        </button>
        {isExpanded && (
          <div className="horse-category-list">
            {favoriteError && <p className="sync-bar-error">{favoriteError}</p>}
            {list.length === 0 && <p className="hint">Keine Pferde in dieser Kategorie.</p>}
            {list.map((horse) => {
              const c = classify(horse)
              const rowExpanded = expandedHorseId === horse.id
              return (
                <div className="horse-category-item" key={horse.id}>
                  <div className="horse-category-row">
                    <button
                      className="horse-category-row-name"
                      onClick={() => setExpandedHorseId(rowExpanded ? null : horse.id)}
                    >
                      🐴 {horse.name}
                      {c.viaGroupName && <span className="horse-category-row-group">{c.viaGroupName}</span>}
                    </button>
                    <button
                      className="icon-button horse-favorite-star"
                      onClick={() => toggleFavorite(horse, c.isFavorite)}
                      disabled={favoriteBusyId === horse.id}
                      aria-label={c.isFavorite ? 'Favorit entfernen' : 'Als Favorit markieren'}
                    >
                      {c.isFavorite ? '★' : '☆'}
                    </button>
                  </div>
                  {rowExpanded && renderHorseDetail(horse, c, false)}
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      <div className="edit-panel horse-join-panel">
        <h3>Pferd folgen</h3>
        <p className="hint">
          Code von der Person, die das Pferd verwaltet, eingeben – ihr seht euch danach gegenseitig (unabhängig
          voneinander wieder entfolgbar).
        </p>
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
        {joinMessage && <p className={joinMessage.isError ? 'sync-bar-error' : 'hint'}>{joinMessage.text}</p>}
      </div>

      <p className="hint">
        Dein eigenes Pferd oben. Umbenennen/Löschen kann nur, wem das Pferd gehört (Löschen entfernt dann auch alle
        zugehörigen Termine, Betreuer:innen, Aufgaben und Zeitfenster – für alle, die mitsynchronisieren).
      </p>

      <div className="card-list">
        {ownHorses.map((horse) => (
          <div key={horse.id}>{renderHorseDetail(horse, classify(horse))}</div>
        ))}
      </div>

      {classificationError && (
        <p className="sync-bar-error">Einordnung konnte nicht geladen werden: {classificationError}</p>
      )}

      {renderCategory('favoriten', 'Favoriten', favoriteHorses)}
      {renderCategory('gefolgt', 'Einzeln gefolgt', followedHorses)}
      {renderCategory('gruppen', 'Gruppen', groupHorses)}

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
