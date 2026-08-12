-- ============================================================
--  الترحيل الثالث — أسماء المستخدمين + التعليقات العامة + الردود + الإعجابات
--  شغّله كاملًا مرة واحدة في: Supabase Dashboard > SQL Editor > Run
--  آمن للتكرار.
-- ============================================================

-- 1) اسم المستخدم في profiles
alter table public.profiles add column if not exists username text;

-- تفرّد غير حسّاس لحالة الأحرف
create unique index if not exists profiles_username_lower_idx
  on public.profiles (lower(username));

-- صيغة الاسم: حروف/أرقام/شرطة سفلية، 3..20
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'username_format') then
    alter table public.profiles
      add constraint username_format
      check (username is null or username ~ '^[A-Za-z0-9_]{3,20}$');
  end if;
end $$;

-- 2) دوال مساعدة (تعمل قبل تسجيل الدخول أيضًا)
-- إيجاد البريد المرتبط باسم مستخدم (للدخول باليوزر نيم)
create or replace function public.email_for_username(uname text)
returns text language sql security definer stable set search_path = public as $$
  select u.email from auth.users u
  join public.profiles p on p.id = u.id
  where lower(p.username) = lower(uname)
  limit 1;
$$;
grant execute on function public.email_for_username(text) to anon, authenticated;

-- هل اسم المستخدم متاح؟
create or replace function public.username_available(uname text)
returns boolean language sql security definer stable set search_path = public as $$
  select not exists (select 1 from public.profiles where lower(username) = lower(uname));
$$;
grant execute on function public.username_available(text) to anon, authenticated;

-- 3) التعليقات العامة على الحلقات (+ الردود بمستوى واحد عبر parent_id)
create table if not exists public.episode_comments (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  author_username text,
  tvmaze_id       integer not null,
  episode_id      integer not null,
  parent_id       uuid references public.episode_comments (id) on delete cascade,
  body            text not null,
  show_name       text,
  episode_code    text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_comments_episode on public.episode_comments (episode_id);
create index if not exists idx_comments_parent on public.episode_comments (parent_id);

alter table public.episode_comments enable row level security;

-- القراءة: أي مستخدم مسجّل يرى كل التعليقات (عامة)
drop policy if exists "comments_read" on public.episode_comments;
create policy "comments_read" on public.episode_comments
  for select using (auth.role() = 'authenticated');

-- الكتابة: باسم صاحبها فقط
drop policy if exists "comments_insert" on public.episode_comments;
create policy "comments_insert" on public.episode_comments
  for insert with check (auth.uid() = user_id);

-- الحذف: صاحبها أو مشرف/أدمن
drop policy if exists "comments_delete" on public.episode_comments;
create policy "comments_delete" on public.episode_comments
  for delete using (auth.uid() = user_id or public.is_moderator());

-- فلتر الكلمات + فرض مستوى واحد للردود
create or replace function public.check_comment()
returns trigger language plpgsql security definer set search_path = public as $$
declare bad text; parent_parent uuid;
begin
  -- كلمات محظورة
  if new.body is not null and length(trim(new.body)) > 0 then
    select word into bad from public.banned_words
    where new.body ilike '%' || word || '%' limit 1;
    if bad is not null then raise exception 'COMMENT_BLOCKED'; end if;
  end if;
  -- منع الرد على رد (مستوى واحد فقط)
  if new.parent_id is not null then
    select parent_id into parent_parent from public.episode_comments where id = new.parent_id;
    if parent_parent is not null then raise exception 'ONLY_ONE_LEVEL'; end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_check_comment on public.episode_comments;
create trigger trg_check_comment
  before insert on public.episode_comments
  for each row execute function public.check_comment();

-- 4) الإعجابات
create table if not exists public.comment_likes (
  comment_id uuid not null references public.episode_comments (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

alter table public.comment_likes enable row level security;

drop policy if exists "likes_read" on public.comment_likes;
create policy "likes_read" on public.comment_likes
  for select using (auth.role() = 'authenticated');

drop policy if exists "likes_insert" on public.comment_likes;
create policy "likes_insert" on public.comment_likes
  for insert with check (auth.uid() = user_id);

drop policy if exists "likes_delete" on public.comment_likes;
create policy "likes_delete" on public.comment_likes
  for delete using (auth.uid() = user_id);

-- 5) حجز اسم المستخدم Jimmysh لحساب الأدمن
update public.profiles set username = 'Jimmysh'
where role = 'admin' and username is null;
