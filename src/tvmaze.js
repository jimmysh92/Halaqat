const BASE = "https://api.tvmaze.com";

// بحث عن مسلسلات — يعيد مصفوفة كائنات show مرتبة حسب الصلة
export async function searchShows(query) {
  const res = await fetch(`${BASE}/search/shows?q=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error("تعذّر البحث في TVmaze");
  const data = await res.json();
  return data.map((item) => item.show);
}

// جلب بيانات مسلسل واحد (يشمل الملخّص والتصنيفات)
export async function getShow(tvmazeId) {
  const res = await fetch(`${BASE}/shows/${tvmazeId}`);
  if (!res.ok) throw new Error("تعذّر جلب بيانات المسلسل");
  return res.json();
}

// جلب كل حلقات مسلسل عبر معرّف TVmaze
export async function getEpisodes(tvmazeId) {
  const res = await fetch(`${BASE}/shows/${tvmazeId}/episodes`);
  if (!res.ok) throw new Error("تعذّر جلب الحلقات");
  return res.json();
}

// هل عُرضت الحلقة بالفعل؟ نعتمد airstamp (تاريخ+وقت) وإلا airdate
export function isAired(ep) {
  const t = airTime(ep);
  return t !== null && t <= Date.now();
}

// وقت العرض كـ timestamp، أو null لو غير متاح
export function airTime(ep) {
  const stamp = ep.airstamp || ep.airdate;
  if (!stamp) return null;
  const t = new Date(stamp).getTime();
  return Number.isNaN(t) ? null : t;
}

// رمز الحلقة مثل S01E04
export function episodeCode(ep) {
  const s = ep.season != null ? String(ep.season).padStart(2, "0") : "??";
  const n = ep.number != null ? String(ep.number).padStart(2, "0") : "special";
  return `S${s}E${n}`;
}
