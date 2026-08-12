# حلقات — متابِع المسلسلات

تطبيق React + Supabase يجلب حلقات مسلسلاتك من TVmaze (بدون مفتاح API)، ويخليك
تأشّر على اللي شاهدته، وتشوف بلمحة **الحلقات المعروضة اللي بانتظارك**. البيانات
تتزامن عبر أجهزتك عبر حسابك في Supabase.

## المتطلبات

- Node.js 18 أو أحدث
- حساب Supabase مجاني

## 1) إعداد Supabase

1. أنشئ مشروعًا جديدًا على <https://supabase.com>.
2. من **SQL Editor**، الصق محتوى `schema.sql` كاملًا واضغط **Run**. هذا ينشئ
   الجدولين ويفعّل عزل البيانات (RLS) لكل مستخدم.
3. من **Project Settings > API**، انسخ:
   - `Project URL` → يذهب في `VITE_SUPABASE_URL`
   - `anon public` key → يذهب في `VITE_SUPABASE_ANON_KEY`
4. (اختياري لتسريع التجربة) من **Authentication > Providers > Email**، أطفئ
   *Confirm email* عشان تدخل مباشرة بعد إنشاء الحساب دون تأكيد بريد.

## 2) التشغيل محليًا

```bash
cp .env.example .env      # ثم عبّئ القيمتين
npm install
npm run dev
```

افتح الرابط اللي يظهر (عادة <http://localhost:5173>)، أنشئ حسابًا، وابدأ.

## 3) النشر على Netlify

- **Build command:** `npm run build`
- **Publish directory:** `dist`
- أضف متغيّري البيئة في Netlify:
  `Site settings > Environment variables` →
  `VITE_SUPABASE_URL` و `VITE_SUPABASE_ANON_KEY`.

> ملاحظة: أضف رابط موقعك على Netlify في Supabase تحت
> **Authentication > URL Configuration** (Site URL / Redirect URLs).

## كيف يشتغل

- **الكتالوج (المسلسلات والحلقات)** يُجلب مباشرة من TVmaze عند الطلب، فالحلقات
  الجديدة تظهر تلقائيًا دون أي صيانة.
- **Supabase** يخزّن فقط: أي مسلسلات تتابع، وأي حلقات أشّرت أنك شاهدتها.
- **العرض:** الحلقة تُعتبر "معروضة" إذا تجاوز وقت بثّها (`airstamp`) اللحظة الحالية.

## ملاحظات

- TVmaze تغطيته أغلبها إنجليزي، فابحث بالاسم الإنجليزي للمسلسل.
- حد المعدّل في TVmaze ~20 طلبًا كل 10 ثوانٍ؛ التطبيق يجلب حلقات مسلسلاتك بتوازٍ
  محدود (3) لتفادي تجاوز الحد.
- ما فيه مفاتيح سرّية في الكود؛ مفتاح `anon` عام بطبيعته، والحماية عبر RLS.
