import { useEffect, useState } from 'react'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabaseClient'

interface GroupRow {
  id: string
  name: string
  join_code: string
  owner_id: string
}

interface GroupMember {
  id: string
  email: string
}

// Gruppen geben allen Mitgliedern automatisch gegenseitig Zugriff auf ALLE ihre Pferde (siehe
// has_horse_access in supabase/schema.sql) – anders als der Beitritts-Code pro einzelnem Pferd
// in HorseSection.tsx. Fragt direkt Supabase ab statt über Dexie/lib/sync.ts: Gruppen ändern
// sich selten und ihr einziger Zweck setzt ohnehin eine Online-Verbindung voraus (wie schon
// AccessRequestsSection.tsx für profiles).
export default function GroupsSection() {
  const { session } = useAuth()
  const [groups, setGroups] = useState<GroupRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [newGroupName, setNewGroupName] = useState('')
  const [creating, setCreating] = useState(false)

  const [joinCodeInput, setJoinCodeInput] = useState('')
  const [joining, setJoining] = useState(false)
  const [joinMessage, setJoinMessage] = useState<{ text: string; isError: boolean } | null>(null)

  const [membersGroupId, setMembersGroupId] = useState<string | null>(null)
  const [members, setMembers] = useState<GroupMember[] | null>(null)
  const [membersError, setMembersError] = useState<string | null>(null)
  const [memberBusyId, setMemberBusyId] = useState<string | null>(null)

  async function load() {
    if (!supabase || !session) return
    // Zwei Abfragen, weil Gruppen, die man selbst erstellt hat, keine eigene group_members-Zeile
    // bekommen (is_group_member() prüft owner_id ODER group_members, siehe schema.sql).
    const [{ data: owned, error: ownedError }, { data: memberRows, error: memberError }] = await Promise.all([
      supabase.from('groups').select('id, name, join_code, owner_id').eq('owner_id', session.user.id),
      supabase.from('group_members').select('groups(id, name, join_code, owner_id)').eq('user_id', session.user.id),
    ])
    if (ownedError) {
      setError(ownedError.message)
      return
    }
    if (memberError) {
      setError(memberError.message)
      return
    }
    setError(null)
    const joined = (memberRows ?? [])
      .map((r) => r.groups as unknown as GroupRow | null)
      .filter((g): g is GroupRow => g !== null)
    const byId = new Map<string, GroupRow>()
    for (const g of [...(owned ?? []), ...joined]) byId.set(g.id, g)
    setGroups([...byId.values()].sort((a, b) => a.name.localeCompare(b.name)))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id])

  async function handleCreate() {
    const name = newGroupName.trim()
    if (!name || !supabase) return
    setCreating(true)
    const { error: createError } = await supabase.rpc('create_group', { p_name: name })
    setCreating(false)
    if (createError) {
      setError(createError.message)
      return
    }
    setNewGroupName('')
    await load()
  }

  async function handleJoin() {
    const code = joinCodeInput.trim()
    if (!code || !supabase) return
    setJoining(true)
    setJoinMessage(null)
    const { data, error: joinError } = await supabase.rpc('join_group_by_code', { code })
    setJoining(false)
    if (joinError) {
      setJoinMessage({ text: joinError.message, isError: true })
      return
    }
    setJoinCodeInput('')
    setJoinMessage({ text: `„${data}“ beigetreten – nach dem nächsten Sync sichtbar.`, isError: false })
    await load()
  }

  async function regenerateCode(group: GroupRow) {
    if (!supabase) return
    const { error: regenError } = await supabase.rpc('regenerate_group_code', { p_id: group.id })
    if (regenError) {
      setError(regenError.message)
      return
    }
    await load()
  }

  async function loadMembers(group: GroupRow) {
    if (membersGroupId === group.id) {
      setMembersGroupId(null)
      return
    }
    setMembersGroupId(group.id)
    setMembers(null)
    setMembersError(null)
    if (!supabase) return
    const { data: memberRows, error: memberError } = await supabase
      .from('group_members')
      .select('user_id')
      .eq('group_id', group.id)
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
    setMembers((profileRows ?? []) as GroupMember[])
  }

  async function removeMember(group: GroupRow, userId: string) {
    if (!supabase) return
    setMemberBusyId(userId)
    const { error: removeError } = await supabase
      .from('group_members')
      .delete()
      .eq('group_id', group.id)
      .eq('user_id', userId)
    setMemberBusyId(null)
    if (removeError) {
      setMembersError(removeError.message)
      return
    }
    setMembers((prev) => prev?.filter((m) => m.id !== userId) ?? null)
  }

  return (
    <div>
      <p className="hint">
        Wer einer Gruppe beitritt, sieht automatisch alle Pferde aller anderen Mitglieder dieser Gruppe – und
        umgekehrt. Für ein einzelnes Pferd reicht weiterhin der Beitritts-Code im Tab „Pferd“.
      </p>

      {error && <p className="sync-bar-error">{error}</p>}

      <div className="card-list">
        {groups?.length === 0 && <p className="empty-state">Noch in keiner Gruppe.</p>}
        {groups?.map((group) => {
          const isOwner = group.owner_id === session?.user.id
          return (
            <div className="horse-manage-card" key={group.id}>
              <div className="horse-manage-card-row">
                <span className="horse-manage-name">
                  👥 {group.name}
                  {isOwner && <span className="horse-manage-active-badge">erstellt von dir</span>}
                </span>
              </div>
              <div className="horse-owner-tools">
                <div className="horse-join-code-row">
                  <span className="horse-join-code-label">Beitritts-Code</span>
                  <span className="horse-join-code-value">{group.join_code}</span>
                  {isOwner && (
                    <button className="secondary-button" onClick={() => regenerateCode(group)}>
                      Neu erzeugen
                    </button>
                  )}
                </div>
                <button className="secondary-button" onClick={() => loadMembers(group)}>
                  {membersGroupId === group.id ? 'Mitglieder ausblenden' : 'Mitglieder anzeigen'}
                </button>
                {membersGroupId === group.id && (
                  <div className="horse-members-list">
                    {membersError && <p className="sync-bar-error">{membersError}</p>}
                    {!membersError && members === null && <p className="hint">Lädt…</p>}
                    {!membersError && members?.length === 0 && (
                      <p className="hint">Noch niemand über den Code beigetreten.</p>
                    )}
                    {members?.map((member) => (
                      <div className="horse-member-row" key={member.id}>
                        <span>{member.email}</span>
                        {isOwner && (
                          <button
                            className="icon-button"
                            onClick={() => removeMember(group, member.id)}
                            disabled={memberBusyId === member.id}
                            aria-label={`${member.email} entfernen`}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="edit-panel horse-join-panel">
        <h3>Gruppe erstellen</h3>
        <div className="field-row">
          <div className="field">
            <input
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="z.B. Stall Sonnenhof"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleCreate()
                }
              }}
            />
          </div>
          <button className="primary-button" onClick={handleCreate} disabled={!newGroupName.trim() || creating}>
            {creating ? '…' : 'Erstellen'}
          </button>
        </div>
      </div>

      <div className="edit-panel horse-join-panel">
        <h3>Gruppe per Code beitreten</h3>
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
            {joining ? '…' : 'Beitreten'}
          </button>
        </div>
        {joinMessage && <p className={joinMessage.isError ? 'sync-bar-error' : 'hint'}>{joinMessage.text}</p>}
      </div>
    </div>
  )
}
