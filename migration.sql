-- ============================================================
--  ترحيل: إضافة قائمة المشاهدة (watchlist) لقاعدة بيانات موجودة
--  شغّله مرة واحدة في: Supabase Dashboard > SQL Editor > Run
--  آمن للتكرار — لن يكسر بياناتك الحالية.
-- ============================================================

alter table public.tracked_shows
  add column if not exists list text not null default 'watching';

-- كل مسلسلاتك الحالية تبقى ضمن "أتابعه" (watching) تلقائيًا.
