-- Stallplaner: Grundlage für die Pferde-Liste mit Kategorien (Favoriten/Einzeln gefolgt/Gruppen).
-- Favoriten sind eine reine Account-Präferenz, unabhängig davon, wie der Zugriff aufs Pferd
-- zustande kam (Code oder Gruppe) -- deshalb eine eigene, simple Tabelle statt an
-- horse_members/group_members dranzuhängen.
--
-- Einmalig im Supabase SQL-Editor ausfuehren.

create table horse_favorites (
  user_id uuid not null references auth.users (id) on delete cascade,
  horse_id uuid not null references horses (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, horse_id)
);

alter table horse_favorites enable row level security;

create policy "horse_favorites: own rows" on horse_favorites
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Liefert pro zugänglichem Pferd eine Einordnung für die App: eigenes Pferd, einzeln gefolgt,
-- favorisiert, und -- falls über eine Gruppe sichtbar -- welche Gruppe das ist. Wird direkt
-- abgefragt (wie schon profiles/groups), nicht über lib/sync.ts synchronisiert.
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

-- "Gruppe verlassen": die eigene Mitgliedschaft darf man immer selbst entfernen (analog zu
-- "horse_members: self removes" aus migrations/0017) -- bisher konnte nur die Ersteller:in
-- andere Mitglieder rauswerfen, aber niemand sich selbst austragen.
create policy "group_members: self removes" on group_members
  for delete using (user_id = (select auth.uid()));
