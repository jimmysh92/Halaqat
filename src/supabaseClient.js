import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isConfigured = Boolean(url && anonKey);

if (!isConfigured) {
  console.error(
    "مفقود VITE_SUPABASE_URL أو VITE_SUPABASE_ANON_KEY — انسخ .env.example إلى .env واملأ القيم."
  );
}

// نمرّر قيمًا افتراضية آمنة لتفادي كسر التطبيق قبل الإعداد؛ الواجهة تعرض رسالة الإعداد.
export const supabase = createClient(
  url || "https://placeholder.supabase.co",
  anonKey || "placeholder-anon-key"
);
