import type { EntityTable } from 'dexie'
import { db } from '../db/db'
import type { Caretaker, CareEntry, Horse, TaskDef, TimeSlotDef } from '../db/types'
import { supabase } from './supabaseClient'

// Fängt fehlende/kaputte Zeitstempel ab (z.B. Altdaten aus einer Zeit vor `updatedAt`), statt
// dass new Date(...).toISOString() mit "Invalid time value" den kompletten Sync abbricht. Eine
// Zeile mit unbekanntem Zeitstempel wird dann einfach als "gerade eben geändert" behandelt.
function iso(value: number): string {
  const safeValue = Number.isFinite(value) ? value : Date.now()
  return new Date(safeValue).toISOString()
}

function ms(isoStr: string): number {
  return new Date(isoStr).getTime()
}

// Führt eine Tabelle lokal (Dexie) und remote (Supabase) zu einem gemeinsamen Stand zusammen:
// pro Zeile gewinnt bei Last-Write-Wins der jeweils neuere `updatedAt`-Zeitstempel. Läuft als
// voller Abgleich statt inkrementell seit dem letzten Sync – bei der Datenmenge dieser App
// (ein paar Dutzend Stammdaten-Zeilen, einige hundert Termine) unkritisch und deutlich robuster
// als eine Cursor-/Änderungsprotokoll-Logik.
async function mergeTable<Local extends { id: string; updatedAt: number }, Remote extends { id: string; updated_at: string }>(
  localTable: EntityTable<Local, 'id'>,
  remoteTableName: string,
  toRemote: (local: Local) => Remote,
  fromRemote: (remote: Remote, existingLocal?: Local) => Local,
): Promise<void> {
  if (!supabase) throw new Error('Supabase ist nicht konfiguriert.')

  const localRows = await localTable.toArray()
  const { data: remoteRows, error } = await supabase.from(remoteTableName).select('*')
  if (error) throw new Error(`${remoteTableName}: ${error.message}`)

  const localById = new Map(localRows.map((r) => [r.id, r]))
  const remoteById = new Map(((remoteRows ?? []) as Remote[]).map((r) => [r.id, r]))

  const toPushRemote: Remote[] = []
  const toPutLocal: Local[] = []

  const allIds = new Set([...localById.keys(), ...remoteById.keys()])
  for (const id of allIds) {
    const local = localById.get(id)
    const remote = remoteById.get(id)
    if (local && !remote) {
      toPushRemote.push(toRemote(local))
    } else if (!local && remote) {
      toPutLocal.push(fromRemote(remote))
    } else if (local && remote) {
      const remoteUpdatedAt = ms(remote.updated_at)
      if (local.updatedAt > remoteUpdatedAt) {
        toPushRemote.push(toRemote(local))
      } else if (remoteUpdatedAt > local.updatedAt) {
        toPutLocal.push(fromRemote(remote, local))
      }
    }
  }

  if (toPushRemote.length > 0) {
    const { error: upsertError } = await supabase.from(remoteTableName).upsert(toPushRemote)
    if (upsertError) throw new Error(`${remoteTableName}: ${upsertError.message}`)
  }
  if (toPutLocal.length > 0) {
    await localTable.bulkPut(toPutLocal)
  }
}

interface RemoteHorse {
  id: string
  name: string
  owner_id: string
  updated_at: string
  deleted_at: string | null
}

interface RemoteCaretaker {
  id: string
  horse_id: string
  name: string
  color: string
  user_id: string | null
  updated_at: string
  deleted_at: string | null
}

interface RemoteTaskDef {
  id: string
  horse_id: string
  label: string
  order: number
  updated_at: string
  deleted_at: string | null
}

interface RemoteTimeSlotDef {
  id: string
  horse_id: string
  label: string
  order: number
  updated_at: string
  deleted_at: string | null
}

interface RemoteCareEntry {
  id: string
  horse_id: string
  date_str: string
  time_slot_id: string
  caretaker_id: string
  tasks: CareEntry['tasks']
  note: string | null
  meal_id: string | null
  updated_at: string
  deleted_at: string | null
}

// Zieht die synchronisierbaren Tabellen (Betreuer:innen, Aufgaben, Zeitfenster, Termine,
// das Pferd selbst) mit Supabase zusammen. Zutaten, Mahlzeiten, Gewicht und Gesundheit bleiben
// bewusst außen vor – siehe Memory "project-supabase-sync-concept".
export async function syncAll(): Promise<void> {
  if (!supabase) throw new Error('Supabase ist nicht konfiguriert.')
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) throw new Error('Nicht eingeloggt.')
  const ownerId = userData.user.id

  // Pferd zuerst: caretakers/task_defs/time_slot_defs/care_entries referenzieren horse_id als
  // Fremdschlüssel in Supabase, die Zeile muss also dort existieren, bevor die anderen pushen.
  await mergeTable<Horse, RemoteHorse>(
    db.horses,
    'horses',
    (h) => ({
      id: h.id,
      name: h.name,
      owner_id: ownerId,
      updated_at: iso(h.updatedAt),
      deleted_at: h.deletedAt ? iso(h.deletedAt) : null,
    }),
    (r) => ({
      id: r.id,
      name: r.name,
      ownerId: r.owner_id,
      updatedAt: ms(r.updated_at),
      deletedAt: r.deleted_at ? ms(r.deleted_at) : undefined,
    }),
  )

  await mergeTable<Caretaker, RemoteCaretaker>(
    db.caretakers,
    'caretakers',
    (c) => ({
      id: c.id,
      horse_id: c.horseId,
      name: c.name,
      color: c.color,
      user_id: c.userId ?? null,
      updated_at: iso(c.updatedAt),
      deleted_at: c.deletedAt ? iso(c.deletedAt) : null,
    }),
    (r) => ({
      id: r.id,
      horseId: r.horse_id,
      name: r.name,
      color: r.color,
      userId: r.user_id ?? undefined,
      updatedAt: ms(r.updated_at),
      deletedAt: r.deleted_at ? ms(r.deleted_at) : undefined,
    }),
  )

  await mergeTable<TaskDef, RemoteTaskDef>(
    db.taskDefs,
    'task_defs',
    (t) => ({
      id: t.id,
      horse_id: t.horseId,
      label: t.label,
      order: t.order,
      updated_at: iso(t.updatedAt),
      deleted_at: t.deletedAt ? iso(t.deletedAt) : null,
    }),
    (r) => ({
      id: r.id,
      horseId: r.horse_id,
      label: r.label,
      order: r.order,
      updatedAt: ms(r.updated_at),
      deletedAt: r.deleted_at ? ms(r.deleted_at) : undefined,
    }),
  )

  await mergeTable<TimeSlotDef, RemoteTimeSlotDef>(
    db.timeSlotDefs,
    'time_slot_defs',
    (t) => ({
      id: t.id,
      horse_id: t.horseId,
      label: t.label,
      order: t.order,
      updated_at: iso(t.updatedAt),
      deleted_at: t.deletedAt ? iso(t.deletedAt) : null,
    }),
    (r) => ({
      id: r.id,
      horseId: r.horse_id,
      label: r.label,
      order: r.order,
      updatedAt: ms(r.updated_at),
      deletedAt: r.deleted_at ? ms(r.deleted_at) : undefined,
    }),
  )

  await mergeTable<CareEntry, RemoteCareEntry>(
    db.careEntries,
    'care_entries',
    (e) => ({
      id: e.id,
      horse_id: e.horseId,
      date_str: e.dateStr,
      time_slot_id: e.timeSlotId,
      caretaker_id: e.caretakerId,
      tasks: e.tasks,
      note: e.note ?? null,
      meal_id: e.mealId ?? null,
      updated_at: iso(e.updatedAt),
      deleted_at: e.deletedAt ? iso(e.deletedAt) : null,
    }),
    // mealDeductedAt bewusst NICHT aus remote übernehmen, sondern den lokalen Wert erhalten:
    // der Vorratsabzug ist rein geräte-lokal (siehe Kommentar an CareEntry in db/types.ts).
    (r, existingLocal) => ({
      id: r.id,
      horseId: r.horse_id,
      dateStr: r.date_str,
      timeSlotId: r.time_slot_id,
      caretakerId: r.caretaker_id,
      tasks: r.tasks,
      note: r.note ?? undefined,
      mealId: r.meal_id ?? undefined,
      mealDeductedAt: existingLocal?.mealDeductedAt,
      updatedAt: ms(r.updated_at),
      deletedAt: r.deleted_at ? ms(r.deleted_at) : undefined,
    }),
  )
}
