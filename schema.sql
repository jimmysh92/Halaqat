-- ============================================================
--  حلقات — مخطط قاعدة بيانات Supabase (للتركيب الجديد من الصفر)
--  إن كانت جداولك موجودة مسبقًا، استخدم migration.sql بدلًا من هذا.
--  Supabase Dashboard > SQL Editor > Run
-- ============================================================

create table if not exists public.tracked_shows (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  tvmaze_id  integer not null,
  name       text not null,
  image_url  text,
  status     text,
  list       text not null default 'watching',   -- 'watching' أو 'watchlist'
  added_at   timestamptz not null default now(),
  unique (user_id, tvmaze_id)
);

create table if not exists public.watched_episodes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  tvmaze_id   integer not null,
  episode_id  integer not null,
  watched_at  timestamptz not null default now(),
  unique (user_id, episode_id)
);

create index if not exists idx_tracked_shows_user on public.tracked_shows (user_id);
create index if not exists idx_watched_user on public.watched_episodes (user_id);

alter table public.tracked_shows    enable row level security;
alter table public.watched_episodes enable row level security;

drop policy if exists "own_tracked_shows" on public.tracked_shows;
create policy "own_tracked_shows"
  on public.tracked_shows for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own_watched_episodes" on public.watched_episodes;
create policy "own_watched_episodes"
  on public.watched_episodes for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
