create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z][0-9]{4}$'),
  owner_player_id uuid,
  status text not null check (status in ('lobby', 'playing', 'finished', 'closed')),
  state jsonb,
  version integer not null default 0 check (version >= 0),
  window_deadline timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 20),
  token_hash text not null check (token_hash ~ '^[a-f0-9]{64}$'),
  muted boolean not null default false,
  joined_at timestamptz not null default now(),
  seat integer not null check (seat >= 0),
  constraint players_room_seat_unique unique (room_id, seat)
);

create unique index if not exists players_room_name_unique
  on public.players(room_id, lower(name));
create index if not exists players_room_token_hash_idx
  on public.players(room_id, token_hash);

alter table public.rooms
  add constraint rooms_owner_player_id_fkey
  foreign key (owner_player_id)
  references public.players(id)
  on delete set null;

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  player_id uuid references public.players(id) on delete set null,
  body text not null check (char_length(body) between 1 and 300),
  created_at timestamptz not null default now()
);

create index if not exists rooms_status_updated_at_idx
  on public.rooms(status, updated_at);
create index if not exists players_room_seat_idx
  on public.players(room_id, seat);
create index if not exists chat_messages_room_created_at_idx
  on public.chat_messages(room_id, created_at);

create or replace function public.touch_room_updated_at_from_child()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.rooms
  set updated_at = now(),
      version = version + case when tg_table_name = 'players' then 1 else 0 end
  where id = case when tg_op = 'DELETE' then old.room_id else new.room_id end;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger players_touch_room_updated_at
after insert or update or delete on public.players
for each row execute function public.touch_room_updated_at_from_child();

create trigger chat_messages_touch_room_updated_at
after insert or update or delete on public.chat_messages
for each row execute function public.touch_room_updated_at_from_child();

revoke all on function public.touch_room_updated_at_from_child()
  from public, anon, authenticated;
grant execute on function public.touch_room_updated_at_from_child()
  to service_role;

alter table public.rooms enable row level security;
alter table public.players enable row level security;
alter table public.chat_messages enable row level security;

revoke all on table public.rooms, public.players, public.chat_messages
  from public, anon, authenticated;
grant all on table public.rooms, public.players, public.chat_messages
  to service_role;
