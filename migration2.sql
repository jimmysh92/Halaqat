-- ============================================================
--  الترحيل الثاني — الأدوار، التقييمات/التعليقات، وفلتر الكلمات
--  شغّله كاملًا مرة واحدة في: Supabase Dashboard > SQL Editor > Run
--  آمن للتكرار.
--  *** لا تنسَ آخر سطر: ضع بريدك لتصير أدمن. ***
-- ============================================================

-- 1) جدول ملفات المستخدمين + الأدوار
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text,
  role       text not null default 'user',   -- 'user' | 'moderator' | 'admin'
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- دوال تحقق الدور (SECURITY DEFINER لتفادي التكرار في RLS)
create or replace function public.is_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.is_moderator()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('moderator','admin'));
$$;

-- إنشاء ملف تلقائيًا عند تسجيل أي مستخدم جديد
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- تعبئة المستخدمين الحاليين (حسابك)
insert into public.profiles (id, email)
select id, email from auth.users
on conflict (id) do nothing;

-- سياسات profiles
drop policy if exists "profiles_read" on public.profiles;
create policy "profiles_read" on public.profiles
  for select using (auth.uid() = id or public.is_admin());

drop policy if exists "profiles_self_update" on public.profiles;
create policy "profiles_self_update" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "profiles_admin_update" on public.profiles;
create policy "profiles_admin_update" on public.profiles
  for update using (public.is_admin()) with check (public.is_admin());

-- 2) توسيع سياسات المسلسلات والحلقات لتشمل الأدمن
drop policy if exists "own_tracked_shows" on public.tracked_shows;
create policy "own_tracked_shows" on public.tracked_shows
  for all using (auth.uid() = user_id or public.is_admin())
  with check (auth.uid() = user_id or public.is_admin());

drop policy if exists "own_watched_episodes" on public.watched_episodes;
create policy "own_watched_episodes" on public.watched_episodes
  for all using (auth.uid() = user_id or public.is_admin())
  with check (auth.uid() = user_id or public.is_admin());

-- 3) التقييمات والتعليقات لكل حلقة
create table if not exists public.episode_notes (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  tvmaze_id    integer not null,
  episode_id   integer not null,
  rating       numeric(2,1),          -- 0.5 .. 5.0 (نصف نجمة)
  comment      text,
  show_name    text,
  episode_code text,
  updated_at   timestamptz not null default now(),
  unique (user_id, episode_id),
  check (rating is null or (rating >= 0 and rating <= 5))
);

alter table public.episode_notes enable row level security;

drop policy if exists "notes_read" on public.episode_notes;
create policy "notes_read" on public.episode_notes
  for select using (auth.uid() = user_id or public.is_moderator());

drop policy if exists "notes_insert" on public.episode_notes;
create policy "notes_insert" on public.episode_notes
  for insert with check (auth.uid() = user_id);

drop policy if exists "notes_update" on public.episode_notes;
create policy "notes_update" on public.episode_notes
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "notes_delete" on public.episode_notes;
create policy "notes_delete" on public.episode_notes
  for delete using (auth.uid() = user_id or public.is_moderator());

create index if not exists idx_notes_user on public.episode_notes (user_id);

-- 4) الكلمات المحظورة + فلتر عند الكتابة
create table if not exists public.banned_words (
  id         uuid primary key default gen_random_uuid(),
  word       text not null unique,
  created_at timestamptz not null default now()
);

alter table public.banned_words enable row level security;

drop policy if exists "banned_admin_all" on public.banned_words;
create policy "banned_admin_all" on public.banned_words
  for all using (public.is_admin()) with check (public.is_admin());

-- يرفض حفظ أي تعليق يحتوي كلمة محظورة (يعمل خادميًا فلا يمكن تجاوزه)
create or replace function public.check_banned_words()
returns trigger language plpgsql security definer set search_path = public as $$
declare bad text;
begin
  if new.comment is not null and length(trim(new.comment)) > 0 then
    select word into bad from public.banned_words
    where new.comment ilike '%' || word || '%' limit 1;
    if bad is not null then
      raise exception 'COMMENT_BLOCKED';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_check_banned on public.episode_notes;
create trigger trg_check_banned
  before insert or update on public.episode_notes
  for each row execute function public.check_banned_words();

-- ============================================================
--  5) *** اجعل حسابك أدمن — استبدل البريد ببريدك ثم شغّل ***
-- ============================================================
-- update public.profiles set role = 'admin' where email = 'YOUR_EMAIL_HERE';
