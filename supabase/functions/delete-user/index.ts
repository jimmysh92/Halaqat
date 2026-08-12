// دالة حذف حساب نهائيًا — تعمل على خادم Supabase (Deno).
// تتحقق أن المنادي "أدمن" قبل الحذف، وتستخدم مفتاح الخدمة السرّي المتاح تلقائيًا على الخادم فقط.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return json({ error: "unauthorized" }, 401);

    // من هو المنادي؟
    const caller = createClient(url, anon, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: uErr } = await caller.auth.getUser();
    if (uErr || !userData?.user) return json({ error: "unauthorized" }, 401);

    // عميل بصلاحيات كاملة (على الخادم فقط)
    const admin = createClient(url, serviceKey);

    // تأكّد أن المنادي أدمن
    const { data: prof } = await admin
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .single();
    if (!prof || prof.role !== "admin") return json({ error: "forbidden" }, 403);

    const { target } = await req.json();
    if (!target) return json({ error: "missing target" }, 400);
    if (target === userData.user.id) return json({ error: "cannot delete self" }, 400);

    // الحذف يشمل كل البيانات المرتبطة عبر on delete cascade
    const { error: dErr } = await admin.auth.admin.deleteUser(target);
    if (dErr) return json({ error: dErr.message }, 400);

    return json({ ok: true });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
