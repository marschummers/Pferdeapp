import type { EntityTable } from 'dexie'
import { db, DEFAULT_HORSE_NAME } from '../db/db'
import type { Caretaker, CareEntry, Horse, Ingredient, Meal, TaskDef, TimeSlotDef } from '../db/types'
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
  // Optional: Push über eine RPC-Funktion statt eines direkten .upsert() – Workaround für einen
  // hartnäckigen RLS-Bug auf der horses-Tabelle, siehe migrations/0014_upsert_horse_rpc.sql.
  pushRemote?: (rows: Remote[]) => Promise<void>,
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

  // Erst herunterladen und lokal festschreiben, DANN erst hochladen: schlägt der Push fehl
  // (z.B. eine einzelne verwaiste Zeile ohne Zugriff mehr), sollen bereits erfolgreich vom
  // Server geladene Daten trotzdem lokal ankommen, statt durch den geworfenen Fehler verloren
  // zu gehen. Genau das ist einmal passiert: ein Gerät verlor dadurch vorübergehend sein
  // eigenes, weiterhin serverseitig vorhandenes Pferd.
  if (toPutLocal.length > 0) {
    await localTable.bulkPut(toPutLocal)
  }
  if (toPushRemote.length > 0) {
    if (pushRemote) {
      await pushRemote(toPushRemote)
    } else {
      const { error: upsertError } = await supabase.from(remoteTableName).upsert(toPushRemote)
      if (upsertError) throw new Error(`${remoteTableName}: ${upsertError.message}`)
    }
  }
}

interface RemoteHorse {
  id: string
  name: string
  owner_id: string
  updated_at: string
  deleted_at: string | null
  join_code: string
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

// stock/full_amount bewusst NICHT Teil des Remote-Shapes: der Vorrat bleibt strikt lokal
// (siehe Kommentar an Ingredient in db/types.ts), nur Name/Einheit/Hersteller wandern über
// den Sync, damit fremde Mahlzeit-Rezepte lesbar sind.
interface RemoteIngredient {
  id: string
  horse_id: string
  name: string
  unit: string
  manufacturer: string | null
  updated_at: string
  deleted_at: string | null
}

interface RemoteMeal {
  id: string
  horse_id: string
  name: string
  ingredients: Meal['ingredients']
  prep_steps: string[]
  tip: string | null
  updated_at: string
  deleted_at: string | null
}

// Zieht die synchronisierbaren Tabellen (Betreuer:innen, Aufgaben, Zeitfenster, Termine,
// Zutaten (teilweise), Mahlzeiten, das Pferd selbst) mit Supabase zusammen. Gewicht und
// Gesundheit bleiben bewusst außen vor – siehe Memory "project-supabase-sync-concept".
export async function syncAll(): Promise<void> {
  if (!supabase) throw new Error('Supabase ist nicht konfiguriert.')
  // Als eigene Konstante festgehalten, statt weiter unten (auch innerhalb von Callbacks) auf das
  // Modul-level `supabase` zuzugreifen: TypeScript verliert die oben geprüfte Nicht-null-
  // Einengung sonst innerhalb verschachtelter Funktionsausdrücke wie dem pushRemote-Callback.
  const client = supabase
  const { data: userData, error: userError } = await client.auth.getUser()
  if (userError || !userData.user) throw new Error('Nicht eingeloggt.')
  const ownerId = userData.user.id

  // Vor dem allerersten Sync eines Pferds prüfen, dass es einen echten Namen hat und man sich
  // selbst als Betreuer:in markiert hat (Stern, siehe CaretakersSection.tsx) – sonst sehen die
  // anderen nach dem Sync niemanden, dem sie Aufgaben zuweisen können. Nur für Pferde relevant,
  // die noch nie synchronisiert wurden (ownerId hier lokal noch unbekannt); ein bereits
  // synchronisiertes Pferd hatte diese Hürde beim allerersten Mal schon zu nehmen.
  const unsyncedOwnHorses = await db.horses.filter((h) => !h.deletedAt && h.ownerId === undefined).toArray()
  for (const horse of unsyncedOwnHorses) {
    const trimmedName = horse.name.trim()
    if (!trimmedName || trimmedName === DEFAULT_HORSE_NAME) {
      throw new Error(
        `Bitte vergib zuerst einen echten Namen für "${horse.name}" (Verwaltung → Pferd), bevor du synchronisierst.`,
      )
    }
    const hasSelfCaretaker =
      (await db.caretakers.filter((c) => c.horseId === horse.id && !c.deletedAt && c.userId === ownerId).count()) > 0
    if (!hasSelfCaretaker) {
      throw new Error(
        `Markiere dich zuerst selbst mit dem Stern als Betreuer:in bei "${horse.name}" (Verwaltung → Betreuer:innen), bevor du synchronisierst.`,
      )
    }
  }

  // Pferd zuerst: caretakers/task_defs/time_slot_defs/care_entries referenzieren horse_id als
  // Fremdschlüssel in Supabase, die Zeile muss also dort existieren, bevor die anderen pushen.
  await mergeTable<Horse, RemoteHorse>(
    db.horses,
    'horses',
    (h) => ({
      id: h.id,
      name: h.name,
      // owner_id wird beim Push nicht mehr direkt verwendet (nur fürs Remote-Typ-Shape) – die
      // upsert_horse()-RPC unten setzt ihn serverseitig selbst (Insert: aufrufender Account,
      // Update: unverändert), siehe migrations/0014_upsert_horse_rpc.sql.
      owner_id: h.ownerId ?? ownerId,
      updated_at: iso(h.updatedAt),
      deleted_at: h.deletedAt ? iso(h.deletedAt) : null,
      join_code: h.joinCode,
    }),
    (r) => ({
      id: r.id,
      name: r.name,
      ownerId: r.owner_id,
      updatedAt: ms(r.updated_at),
      deletedAt: r.deleted_at ? ms(r.deleted_at) : undefined,
      joinCode: r.join_code,
    }),
    // Push über eine security-definer-RPC statt direktem .upsert(): ein direkter Schreibzugriff
    // auf horses schlägt trotz nachweislich korrekter RLS-Policy zuverlässig fehl (alter,
    // ungeklärter Bug, siehe migrations/0014_upsert_horse_rpc.sql) – die RPC-Funktion, die
    // bereits für horse_members (join_horse_by_code) zuverlässig funktioniert, umgeht das.
    async (rows) => {
      // Ein Fehler bei einer Zeile darf die anderen nicht blockieren (sonst bräche z.B. eine
      // einzelne verwaiste Karteileiche mitten in der Liste den Rest der Pferde-Pushes ab) --
      // alle Zeilen versuchen, erst am Ende einen etwaigen "echten" Fehler werfen.
      let firstUnexpectedError: Error | null = null
      for (const row of rows) {
        const { error: rpcError } = await client.rpc('upsert_horse', {
          p_id: row.id,
          p_name: row.name,
          p_updated_at: row.updated_at,
          p_deleted_at: row.deleted_at,
          p_join_code: row.join_code,
        })
        if (!rpcError) {
          // Ein Push aktualisiert (anders als ein Pull) nie den lokalen Datensatz -- ohne das
          // hier würde ein frisch angelegtes Pferd sein `ownerId` erst beim nächsten PULL
          // erfahren, was in der Praxis oft nie wieder passiert (Zeitstempel sind ja nach dem
          // Push schon gleich). Der Beitritts-Code-Bereich in HorseSection.tsx (nur für
          // Besitzer:innen) bliebe sonst dauerhaft versteckt. row.owner_id ist hier immer
          // korrekt: bei einem neuen Pferd der aufrufende Account, bei einem bereits bekannten
          // Pferd der schon vorher lokal bekannte (unveränderte) Besitzer.
          await db.horses.update(row.id, { ownerId: row.owner_id })
          continue
        }
        // "Kein Zugriff"/"noch nicht freigegeben": Karteileiche aus einer Zeit, in der RLS auf
        // horses versehentlich deaktiviert war und dadurch auch fremde Pferde lokal landeten
        // (bzw. ein Account, der zwischenzeitlich seine Freigabe verlor). Lokal aufräumen statt
        // den kompletten Sync abzubrechen, sonst blockiert eine einzelne verwaiste Zeile
        // dauerhaft jeden weiteren Versuch – andere, echte Fehler weiterhin hart durchreichen.
        if (rpcError.message.includes('Kein Zugriff') || rpcError.message.includes('noch nicht freigegeben')) {
          await db.transaction(
            'rw',
            db.horses,
            db.caretakers,
            db.taskDefs,
            db.timeSlotDefs,
            db.careEntries,
            async () => {
              await db.horses.delete(row.id)
              await db.caretakers.where('horseId').equals(row.id).delete()
              await db.taskDefs.where('horseId').equals(row.id).delete()
              await db.timeSlotDefs.where('horseId').equals(row.id).delete()
              await db.careEntries.where('horseId').equals(row.id).delete()
            },
          )
          continue
        }
        if (!firstUnexpectedError) firstUnexpectedError = new Error(`horses: ${rpcError.message}`)
      }
      if (firstUnexpectedError) throw firstUnexpectedError
    },
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

  await mergeTable<Ingredient, RemoteIngredient>(
    db.ingredients,
    'ingredients',
    (i) => ({
      id: i.id,
      horse_id: i.horseId,
      name: i.name,
      unit: i.unit,
      manufacturer: i.manufacturer ?? null,
      updated_at: iso(i.updatedAt),
      deleted_at: i.deletedAt ? iso(i.deletedAt) : null,
    }),
    // stock/fullAmount/trackStock bewusst NICHT aus remote übernehmen, sondern den lokalen Wert
    // erhalten: das sind alles rein geräte-lokale Anzeige-/Bestandswerte (siehe Kommentar an
    // Ingredient in db/types.ts) und werden remote gar nicht erst mitgeführt.
    (r, existingLocal) => ({
      id: r.id,
      horseId: r.horse_id,
      name: r.name,
      unit: r.unit,
      manufacturer: r.manufacturer ?? undefined,
      stock: existingLocal?.stock,
      fullAmount: existingLocal?.fullAmount,
      trackStock: existingLocal?.trackStock,
      updatedAt: ms(r.updated_at),
      deletedAt: r.deleted_at ? ms(r.deleted_at) : undefined,
    }),
  )

  await mergeTable<Meal, RemoteMeal>(
    db.meals,
    'meals',
    (m) => ({
      id: m.id,
      horse_id: m.horseId,
      name: m.name,
      ingredients: m.ingredients,
      prep_steps: m.prepSteps,
      tip: m.tip ?? null,
      updated_at: iso(m.updatedAt),
      deleted_at: m.deletedAt ? iso(m.deletedAt) : null,
    }),
    (r) => ({
      id: r.id,
      horseId: r.horse_id,
      name: r.name,
      ingredients: r.ingredients,
      prepSteps: r.prep_steps,
      tip: r.tip ?? undefined,
      updatedAt: ms(r.updated_at),
      deletedAt: r.deleted_at ? ms(r.deleted_at) : undefined,
    }),
  )
}
