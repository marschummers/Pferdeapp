-- Stallplaner: Gruppen -- eine Menge von Accounts, die sich gegenseitig automatisch Zugriff auf
-- ALLE ihre jeweiligen Pferde geben (symmetrisch), statt dass jede Person jede andere einzeln
-- pro Pferd einladen muss (das bleibt als join_horse_by_code() zusätzlich bestehen, für den
-- Fall, dass jemand nur ein einzelnes Pferd teilen will).
--
-- Anlegen/Umbenennen läuft bewusst ausschließlich über security-definer-RPC-Funktionen, nie
-- über direktes .insert()/.update() vom Client -- siehe die Lektion aus migrations/0014
-- (direkte Schreibzugriffe über PostgREST auf RLS-geschützte Tabellen sind in diesem Projekt
-- nachweislich unzuverlässig).
--
-- Einmalig im Supabase SQL-Editor ausfuehren.

create table groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users (id) on delete cascade,
  join_code text not null unique,
  created_at timestamptz not null default now()
);

create table group_members (
  group_id uuid not null references groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  primary key (group_id, user_id)
);

alter table groups enable row level security;
alter table group_members enable row level security;

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

create policy "groups: read if member" on groups
  for select using (is_group_member(id));

create policy "group_members: read if member" on group_members
  for select using (is_group_member(group_id));

-- Mitglieder entfernen darf nur, wer die Gruppe erstellt hat. Beitreten läuft ausschließlich
-- über join_group_by_code() (security definer), keine direkte Insert-Policy nötig.
create policy "group_members: owner removes" on group_members
  for delete using (
    exists (select 1 from groups where id = group_id and owner_id = (select auth.uid()))
  );

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

-- has_horse_access() um eine dritte Bedingung erweitert: Zugriff auch, wenn der/die
-- Besitzer:in des Pferds und der aufrufende Account mindestens eine gemeinsame Gruppe teilen.
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

create or replace function create_group(p_name text)
returns table(id uuid, join_code text)
language plpgsql
security definer
as $$
declare
  new_id uuid;
  new_code text;
begin
  if not exists (select 1 from profiles where id = auth.uid() and approved = true) then
    raise exception 'Zugang noch nicht freigegeben.';
  end if;
  new_id := gen_random_uuid();
  new_code := upper(substr(md5(random()::text || new_id::text), 1, 6));
  insert into groups (id, name, owner_id, join_code) values (new_id, p_name, auth.uid(), new_code);
  return query select new_id, new_code;
end;
$$;

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
