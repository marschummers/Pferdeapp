-- Stallplaner: Supabase-Schema fuer den Wochenplan-Sync.
--
-- Einmalig im Supabase SQL-Editor ausfuehren (Dashboard -> SQL Editor -> Query ausfuehren) --
-- deckt den Stand nach migrations/0001-0021 ab, fuer eine komplette Neuinstallation.
--
-- Struktur folgt dem lokalen Dexie-Schema (siehe src/db/types.ts): pro Pferd eigene
-- Betreuer:innen/Aufgaben/Zeitfenster/Termine sowie -- seit migrations/0021 -- Mahlzeiten
-- (komplett) und Zutaten (nur Name/Einheit/Hersteller, OHNE Bestand). Der Zutaten-Bestand/Vorrat
-- bleibt weiterhin bewusst rein lokal, siehe Memory "project-supabase-sync-concept".
--
-- Zugriffsmodell: Zugangs-Warteliste + Pferd-Beitritt per Code. Ein neuer Account bekommt beim
-- ersten Login (Trigger unten) eine profiles-Zeile mit approved = false und sieht so lange gar
-- nichts, bis ein Admin (feste E-Mail-Adresse, siehe Policies unten) ihn freigibt. Danach sieht
-- der Account trotzdem noch kein einziges Pferd, sondern muss sich ueber den kurzen, pro Pferd
-- eindeutigen join_code gezielt mit einem Pferd verbinden (join_horse_by_code()).
--
-- Historische Anmerkung: die ganz frühen Insert/Update-Fehler auf horses ("new row violates
-- row-level security policy" trotz augenscheinlich korrekter Policy) traten nach dem
-- Wiedereinschalten von RLS (migrations/0013) erneut auf, diesmal auch beim rechtmäßigen
-- Besitzer -- also tatsächlich kein Policy-Logik-Fehler, sondern ein nie geklärtes Problem mit
-- direkten Insert/Update-Zugriffen über PostgREST auf genau diese Tabelle. Workaround: Pferde
-- werden clientseitig nie mehr direkt geschrieben, sondern ausschließlich über die
-- security-definer-Funktion upsert_horse() (siehe unten, migrations/0014) -- die läuft
-- zuverlässig, weil sie (wie join_horse_by_code()) RLS für ihre eigenen internen Schreibzugriffe
-- umgeht. Alle Policies nutzen weiterhin konsequent `(select auth.uid())` statt `auth.uid()`.

create table if not exists horses (
  id uuid primary key,
  name text not null,
  owner_id uuid not null references auth.users (id) on delete cascade,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  join_code text not null unique,
  created_at timestamptz not null default now()
);

-- Wer außer dem Owner Zugriff auf ein Pferd hat -- wird befuellt, indem jemand ueber
-- join_horse_by_code() den join_code des Pferds eingibt (siehe unten).
create table if not exists horse_members (
  horse_id uuid not null references horses (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  primary key (horse_id, user_id)
);

create table if not exists caretakers (
  id uuid primary key,
  horse_id uuid not null references horses (id) on delete cascade,
  name text not null,
  color text not null,
  user_id uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists task_defs (
  id uuid primary key,
  horse_id uuid not null references horses (id) on delete cascade,
  label text not null,
  "order" integer not null,
  updated_at timestamptz not null default now()
);

create table if not exists time_slot_defs (
  id uuid primary key,
  horse_id uuid not null references horses (id) on delete cascade,
  label text not null,
  "order" integer not null,
  updated_at timestamptz not null default now()
);

create table if not exists care_entries (
  id uuid primary key,
  horse_id uuid not null references horses (id) on delete cascade,
  date_str text not null,
  time_slot_id uuid not null,
  caretaker_id uuid not null,
  tasks jsonb not null default '[]',
  note text,
  meal_id uuid,
  updated_at timestamptz not null default now()
);

-- Zutat als Grunddatum: NUR Name/Einheit/Hersteller synchronisiert, absichtlich OHNE
-- Bestand/Vorrat-Spalten -- der bleibt pro Stall/Gerät lokal (siehe src/lib/stock.ts).
create table if not exists ingredients (
  id uuid primary key,
  horse_id uuid not null references horses (id) on delete cascade,
  name text not null,
  unit text not null,
  manufacturer text,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists meals (
  id uuid primary key,
  horse_id uuid not null references horses (id) on delete cascade,
  name text not null,
  ingredients jsonb not null default '[]',
  prep_steps jsonb not null default '[]',
  tip text,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Eine Gruppe: Accounts darin geben sich gegenseitig automatisch Zugriff auf ALLE ihre
-- jeweiligen Pferde (siehe has_horse_access() weiter unten), statt dass jede Person jede andere
-- einzeln pro Pferd einladen muss. Ergänzt horse_members, ersetzt es nicht.
create table if not exists groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users (id) on delete cascade,
  join_code text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists group_members (
  group_id uuid not null references groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  primary key (group_id, user_id)
);

-- Reine Account-Präferenz, unabhängig davon wie der Zugriff aufs Pferd zustande kam (Code oder
-- Gruppe) -- für die Kategorie "Favoriten" in der Pferde-Liste.
create table if not exists horse_favorites (
  user_id uuid not null references auth.users (id) on delete cascade,
  horse_id uuid not null references horses (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, horse_id)
);

-- Ein Account pro auth.users-Zeile (automatisch per Trigger angelegt, siehe unten). approved
-- steuert die Zugangs-Warteliste: erst wenn true, greift has_horse_access() ueberhaupt.
create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  approved boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profiles (id, email) values (new.id, new.email);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Alle Gruppen-IDs, denen ein Account angehört (als Ersteller:in oder Mitglied).
create or replace function group_ids_for_user(u_id uuid)
returns setof uuid
language sql
security definer
stable
as $$
  select id from groups where owner_id = u_id
  union
  select group_id from group_members where user_id = u_id;
$$;

-- Zugriff auf Betreuer:innen/Aufgaben/Zeitfenster/Termine (und darüber auch lesend auf die
-- Pferde selbst, siehe "horses: read if member" unten): nur mit approved = true UND
-- (Owner, in horse_members eingetragen, oder eine gemeinsame Gruppe mit dem/der Besitzer:in).
create or replace function has_horse_access(h_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select
    exists (select 1 from profiles where id = (select auth.uid()) and approved = true)
    and (
      exists (select 1 from horses where id = h_id and owner_id = (select auth.uid()))
      or exists (select 1 from horse_members where horse_id = h_id and user_id = (select auth.uid()))
      or exists (
        select 1 from horses h
        where h.id = h_id
        and exists (
          select gid from group_ids_for_user(h.owner_id) gid
          intersect
          select gid from group_ids_for_user((select auth.uid())) gid
        )
      )
    );
$$;

-- Tritt dem Pferd zum angegebenen Code bei (fuer den aufrufenden, bereits freigegebenen
-- Account). Wird aus der App per supabase.rpc('join_horse_by_code', { code }) aufgerufen.
-- Gegenseitig: die andere Person sieht danach automatisch auch das/die eigene(n) Pferd(e) --
-- Entfolgen bleibt trotzdem je Richtung unabhängig (siehe "horse_members: self removes").
create or replace function join_horse_by_code(code text)
returns text
language plpgsql
security definer
as $$
declare
  target_horse horses%rowtype;
begin
  if not exists (select 1 from profiles where id = auth.uid() and approved = true) then
    raise exception 'Zugang noch nicht freigegeben.';
  end if;

  select * into target_horse from horses where join_code = upper(code) and deleted_at is null;
  if not found then
    raise exception 'Ungültiger Code.';
  end if;

  insert into horse_members (horse_id, user_id)
  values (target_horse.id, auth.uid())
  on conflict do nothing;

  insert into horse_members (horse_id, user_id)
  select h.id, target_horse.owner_id
  from horses h
  where h.owner_id = auth.uid() and h.deleted_at is null
  on conflict do nothing;

  return target_horse.name;
end;
$$;

-- Legt ein Pferd an oder aktualisiert es -- die App schreibt Pferde ausschließlich hierüber,
-- nie direkt per .upsert() auf die Tabelle (siehe historische Anmerkung ganz oben). owner_id
-- wird bewusst nie vom Client übernommen: beim Insert immer der aufrufende Account, beim
-- Update unverändert (Besitzwechsel ist kein vorgesehenes Feature).
-- p_join_code hat einen Standardwert: Geräte, die ein Pferd schon vor Einführung des
-- Beitritts-Codes kannten, senden ihn beim Push evtl. noch nicht mit (kommt erst beim nächsten
-- Pull lokal an) -- ohne Default würde PostgREST dann keine passende Funktions-Signatur finden.
create or replace function upsert_horse(
  p_id uuid,
  p_name text,
  p_updated_at timestamptz,
  p_deleted_at timestamptz,
  p_join_code text default null
)
returns void
language plpgsql
security definer
as $$
begin
  if not exists (select 1 from profiles where id = auth.uid() and approved = true) then
    raise exception 'Zugang noch nicht freigegeben.';
  end if;

  if exists (select 1 from horses where id = p_id) then
    -- Nur Besitzer:in oder fester Admin-Account dürfen ändern (nicht jedes Mitglied) -- wer
    -- nur folgt, kann sich stattdessen selbst austragen ("horse_members: self removes" unten).
    if not (
      exists (select 1 from horses where id = p_id and owner_id = auth.uid())
      or (select auth.jwt() ->> 'email') = 'marschummers@googlemail.com'
    ) then
      raise exception 'Kein Zugriff auf dieses Pferd.';
    end if;
    update horses
    set name = p_name,
        updated_at = p_updated_at,
        deleted_at = p_deleted_at,
        join_code = coalesce(p_join_code, join_code)
    where id = p_id;
  else
    insert into horses (id, name, owner_id, updated_at, deleted_at, join_code)
    values (
      p_id, p_name, auth.uid(), p_updated_at, p_deleted_at,
      coalesce(p_join_code, upper(substr(md5(random()::text || p_id::text), 1, 6)))
    );
  end if;
end;
$$;

create or replace function is_group_member(g_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select
    exists (select 1 from groups where id = g_id and owner_id = (select auth.uid()))
    or exists (select 1 from group_members where group_id = g_id and user_id = (select auth.uid()));
$$;

create or replace function create_group(p_name text)
returns table(id uuid, join_code text)
language plpgsql
security definer
as $$
declare
  new_id uuid;
  new_code text;
begin
  -- profiles.id explizit qualifiziert: sonst kollidiert es mit der Ausgabespalte "id" aus
  -- "returns table(id uuid, ...)" oben ("column reference \"id\" is ambiguous").
  if not exists (select 1 from profiles where profiles.id = auth.uid() and approved = true) then
    raise exception 'Zugang noch nicht freigegeben.';
  end if;
  new_id := gen_random_uuid();
  new_code := upper(substr(md5(random()::text || new_id::text), 1, 6));
  insert into groups (id, name, owner_id, join_code) values (new_id, p_name, auth.uid(), new_code);
  return query select new_id, new_code;
end;
$$;

-- Tritt der Gruppe zum angegebenen Code bei -- gibt danach automatisch (über
-- has_horse_access()) Zugriff auf alle Pferde aller anderen Mitglieder, und umgekehrt.
create or replace function join_group_by_code(code text)
returns text
language plpgsql
security definer
as $$
declare
  target_group groups%rowtype;
begin
  if not exists (select 1 from profiles where id = auth.uid() and approved = true) then
    raise exception 'Zugang noch nicht freigegeben.';
  end if;

  select * into target_group from groups where join_code = upper(code);
  if not found then
    raise exception 'Ungültiger Code.';
  end if;

  insert into group_members (group_id, user_id)
  values (target_group.id, auth.uid())
  on conflict do nothing;

  return target_group.name;
end;
$$;

create or replace function rename_group(p_id uuid, p_name text)
returns void
language plpgsql
security definer
as $$
begin
  if not exists (select 1 from groups where id = p_id and owner_id = auth.uid()) then
    raise exception 'Nur die Gruppen-Ersteller:in darf umbenennen.';
  end if;
  update groups set name = p_name where id = p_id;
end;
$$;

create or replace function regenerate_group_code(p_id uuid)
returns text
language plpgsql
security definer
as $$
declare
  new_code text;
begin
  if not exists (select 1 from groups where id = p_id and owner_id = auth.uid()) then
    raise exception 'Nur die Gruppen-Ersteller:in darf den Code neu erzeugen.';
  end if;
  new_code := upper(substr(md5(random()::text || p_id::text || clock_timestamp()::text), 1, 6));
  update groups set join_code = new_code where id = p_id;
  return new_code;
end;
$$;

-- Liefert pro zugänglichem Pferd eine Einordnung für die Pferde-Liste in der App: eigenes
-- Pferd, einzeln gefolgt, favorisiert, und -- falls über eine Gruppe sichtbar -- welche Gruppe
-- das ist. Wird direkt abgefragt (wie schon profiles/groups), nicht über lib/sync.ts
-- synchronisiert; die eigentlichen Pferd-Daten kommen weiterhin aus dem lokalen Dexie, nur
-- gematcht per horse_id.
create or replace function my_horses()
returns table (
  horse_id uuid,
  name text,
  join_code text,
  owner_id uuid,
  is_own boolean,
  is_followed boolean,
  is_favorite boolean,
  via_group_id uuid,
  via_group_name text
)
language sql
security definer
stable
as $$
  select
    h.id,
    h.name,
    h.join_code,
    h.owner_id,
    h.owner_id = (select auth.uid()),
    exists (select 1 from horse_members hm where hm.horse_id = h.id and hm.user_id = (select auth.uid())),
    exists (select 1 from horse_favorites hf where hf.horse_id = h.id and hf.user_id = (select auth.uid())),
    g.id,
    g.name
  from horses h
  left join lateral (
    select gr.id, gr.name
    from groups gr
    where (
      gr.owner_id = h.owner_id
      or exists (select 1 from group_members gm where gm.group_id = gr.id and gm.user_id = h.owner_id)
    )
    and (
      gr.owner_id = (select auth.uid())
      or exists (select 1 from group_members gm2 where gm2.group_id = gr.id and gm2.user_id = (select auth.uid()))
    )
    order by gr.name
    limit 1
  ) g on true
  where h.deleted_at is null and has_horse_access(h.id);
$$;

alter table groups enable row level security;
alter table group_members enable row level security;
alter table horse_favorites enable row level security;

-- Den Code sieht/verwaltet nicht nur die Ersteller:in, sondern jedes Mitglied (bewusste
-- Entscheidung, siehe Chat) -- nur Mitglieder rauswerfen bleibt der Ersteller:in vorbehalten.
create policy "groups: read if member" on groups
  for select using (is_group_member(id));

create policy "group_members: read if member" on group_members
  for select using (is_group_member(group_id));

create policy "group_members: owner removes" on group_members
  for delete using (
    exists (select 1 from groups where id = group_id and owner_id = (select auth.uid()))
  );
-- "Gruppe verlassen": die eigene Mitgliedschaft darf man immer selbst entfernen.
create policy "group_members: self removes" on group_members
  for delete using (user_id = (select auth.uid()));

create policy "horse_favorites: own rows" on horse_favorites
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

alter table horses enable row level security;
alter table horse_members enable row level security;
alter table caretakers enable row level security;
alter table task_defs enable row level security;
alter table time_slot_defs enable row level security;
alter table care_entries enable row level security;
alter table ingredients enable row level security;
alter table meals enable row level security;
alter table profiles enable row level security;

create policy "horses: read if member" on horses
  for select using (has_horse_access(id));
create policy "horses: owner creates" on horses
  for insert with check (owner_id = (select auth.uid()));
-- Umbenennen/Löschen nur Besitzer:in oder fester Admin-Account (nicht jedes Mitglied) -- der
-- eigentliche Schreibpfad läuft über upsert_horse(), diese Policy ist Verteidigung in der Tiefe.
create policy "horses: owner or admin updates" on horses
  for update using (
    owner_id = (select auth.uid())
    or (select auth.jwt() ->> 'email') = 'marschummers@googlemail.com'
  );

create policy "horse_members: read if member" on horse_members
  for select using (has_horse_access(horse_id));
-- "Entfolgen": die eigene Mitgliedschaft darf man immer selbst entfernen.
create policy "horse_members: self removes" on horse_members
  for delete using (user_id = (select auth.uid()));
-- Entfernen ANDERER Mitglieder (Kicken) darf nur der/die Besitzer:in des jeweiligen Pferds.
-- Beitreten läuft ausschließlich über join_horse_by_code() (security definer), keine direkte
-- Insert-Policy.
create policy "horse_members: owner removes" on horse_members
  for delete using (
    exists (select 1 from horses where id = horse_id and owner_id = (select auth.uid()))
  );

create policy "caretakers: rw if member" on caretakers
  for all using (has_horse_access(horse_id)) with check (has_horse_access(horse_id));
create policy "task_defs: rw if member" on task_defs
  for all using (has_horse_access(horse_id)) with check (has_horse_access(horse_id));
create policy "time_slot_defs: rw if member" on time_slot_defs
  for all using (has_horse_access(horse_id)) with check (has_horse_access(horse_id));
create policy "care_entries: rw if member" on care_entries
  for all using (has_horse_access(horse_id)) with check (has_horse_access(horse_id));
create policy "ingredients: rw if member" on ingredients
  for all using (has_horse_access(horse_id)) with check (has_horse_access(horse_id));
create policy "meals: rw if member" on meals
  for all using (has_horse_access(horse_id)) with check (has_horse_access(horse_id));

-- Jede*r darf die eigene Zeile lesen (fuer den "Warte auf Freigabe"-Bildschirm in der App).
create policy "profiles: read own" on profiles
  for select using (id = (select auth.uid()));
-- Nur der Admin (feste E-Mail-Adresse) sieht alle Profile (Warteliste) und darf approved setzen.
create policy "profiles: admin reads all" on profiles
  for select using ((select auth.jwt() ->> 'email') = 'marschummers@googlemail.com');
create policy "profiles: admin approves" on profiles
  for update using ((select auth.jwt() ->> 'email') = 'marschummers@googlemail.com');
-- Besitzer:innen duerfen zusaetzlich die Profile (E-Mail) der Mitglieder ihrer eigenen Pferde
-- lesen, fuer die Mitglieder-Liste in der Verwaltung.
create policy "profiles: owner reads horse members" on profiles
  for select using (
    exists (
      select 1 from horse_members hm
      join horses h on h.id = hm.horse_id
      where hm.user_id = profiles.id and h.owner_id = (select auth.uid())
    )
  );
