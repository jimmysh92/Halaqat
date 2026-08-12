import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase, isConfigured } from "./supabaseClient";
import { searchShows, getShow, getEpisodes, isAired, airTime, episodeCode } from "./tvmaze";
import StarRating from "./StarRating";
import Comments from "./Comments";
import { AdminPanel, ModeratorPanel } from "./Admin";
import { useI18n } from "./i18n.jsx";

function stripHtml(html) {
  if (!html) return "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  return (doc.body.textContent || "").trim();
}
function formatDate(dateStr, lang) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(lang === "ar" ? "ar" : "en", { year: "numeric", month: "short", day: "numeric" });
}
function statusLabel(status, t) {
  if (status === "Running") return t("st_running");
  if (status === "Ended") return t("st_ended");
  if (status === "To Be Determined") return t("st_tbd");
  if (status === "In Development") return t("st_dev");
  return status || "—";
}
function nextUnwatched(eps, watched) {
  if (!eps) return null;
  const cand = eps.filter((ep) => isAired(ep) && !watched.has(ep.id))
    .sort((a, b) => (a.season ?? 0) - (b.season ?? 0) || (a.number ?? 0) - (b.number ?? 0));
  return cand[0] || null;
}
const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;

export default function App() {
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem("halaqat-theme") || "dark"; } catch { return "dark"; } });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem("halaqat-theme", theme); } catch {}
  }, [theme]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthReady(true); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const loadProfile = useCallback(() => {
    if (!session) { setProfile(null); return; }
    setProfileLoading(true);
    supabase.from("profiles").select("role, email, username").eq("id", session.user.id).single()
      .then(({ data }) => setProfile(data || { role: "user", username: null }))
      .catch(() => setProfile({ role: "user", username: null }))
      .finally(() => setProfileLoading(false));
  }, [session]);
  useEffect(() => { loadProfile(); }, [loadProfile]);

  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  if (!isConfigured) return <ConfigNotice />;
  if (!authReady) return <Splash />;
  if (!session) return <AuthScreen />;
  if (!profile && profileLoading) return <Splash />;
  if (profile && !profile.username)
    return <ChooseUsername session={session} onDone={(u) => setProfile((p) => ({ ...(p || {}), username: u }))} />;

  return <Dashboard session={session} role={profile?.role || "user"} username={profile?.username || "—"} theme={theme} onToggleTheme={toggleTheme} />;
}

function Splash() {
  const { t } = useI18n();
  return <div className="center-screen"><div className="brand-mark lg"><span className="dot" />{t("brand")}</div><p className="muted">{t("loading")}</p></div>;
}
function ConfigNotice() {
  const { t } = useI18n();
  return (
    <div className="center-screen">
      <div className="card notice"><div className="brand-mark lg"><span className="dot" />{t("brand")}</div><h2>{t("config_title")}</h2><p className="muted">{t("config_body")}</p></div>
    </div>
  );
}

function AuthScreen() {
  const { t } = useI18n();
  const [mode, setMode] = useState("signin");
  const [identifier, setIdentifier] = useState(() => { try { return localStorage.getItem("halaqat-remember-id") || ""; } catch { return ""; } });
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);

  function persistRemember(id) {
    try { if (remember && id) localStorage.setItem("halaqat-remember-id", id); else localStorage.removeItem("halaqat-remember-id"); } catch {}
  }
  async function signIn() {
    if (!identifier || !password) return setErr(t("enter_id_pw"));
    setBusy(true);
    try {
      let loginEmail = identifier.trim();
      if (!loginEmail.includes("@")) {
        const { data, error } = await supabase.rpc("email_for_username", { uname: loginEmail });
        if (error) throw error;
        if (!data) throw new Error(t("no_user_named"));
        loginEmail = data;
      }
      const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password });
      if (error) throw error;
      persistRemember(identifier.trim());
    } catch (e) { setErr(e.message || t("signin_failed")); } finally { setBusy(false); }
  }
  async function signUp() {
    if (!username || !email || !password) return setErr(t("fill_all"));
    if (!USERNAME_RE.test(username)) return setErr(t("username_rule"));
    setBusy(true);
    try {
      const { data: avail, error: aErr } = await supabase.rpc("username_available", { uname: username });
      if (aErr) throw aErr;
      if (!avail) throw new Error(t("username_taken"));
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
      if (data.session && data.user) { await supabase.from("profiles").update({ username }).eq("id", data.user.id); persistRemember(username); }
      else setMsg(t("confirm_email_msg"));
    } catch (e) { setErr(e.message || t("signup_failed")); } finally { setBusy(false); }
  }
  const submit = () => { setErr(null); setMsg(null); mode === "signin" ? signIn() : signUp(); };

  return (
    <div className="center-screen">
      <div className="card auth-card">
        <div className="auth-top"><div className="brand-mark lg"><span className="dot" />{t("brand")}</div><LangButton /></div>
        <p className="muted auth-sub">{t("auth_sub")}</p>
        {mode === "signup" && (
          <label className="field"><span>{t("username")}</span><input value={username} onChange={(e) => setUsername(e.target.value)} placeholder={t("ph_username")} dir="ltr" autoComplete="username" /></label>
        )}
        {mode === "signin" ? (
          <label className="field"><span>{t("id_or_username")}</span><input value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder={t("ph_id")} dir="ltr" autoComplete="username" /></label>
        ) : (
          <label className="field"><span>{t("email")}</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" dir="ltr" autoComplete="email" /></label>
        )}
        <label className="field"><span>{t("password")}</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" dir="ltr" autoComplete={mode === "signin" ? "current-password" : "new-password"} onKeyDown={(e) => e.key === "Enter" && submit()} /></label>
        {mode === "signin" && (
          <label className="remember"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /><span>{t("remember")}</span></label>
        )}
        {err && <div className="alert error">{err}</div>}
        {msg && <div className="alert info">{msg}</div>}
        <button className="btn primary block" onClick={submit} disabled={busy}>{busy ? t("wait") : mode === "signin" ? t("signin") : t("signup")}</button>
        <button className="btn link" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setErr(null); setMsg(null); }}>{mode === "signin" ? t("no_account") : t("have_account")}</button>
      </div>
    </div>
  );
}

function LangButton() {
  const { t, toggle } = useI18n();
  return <button className="btn ghost icon" onClick={toggle} title={t("toggle_lang")}>{t("toggle_lang")}</button>;
}

function ChooseUsername({ session, onDone }) {
  const { t } = useI18n();
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  async function save() {
    setErr(null);
    if (!USERNAME_RE.test(username)) return setErr(t("username_rule_short"));
    setBusy(true);
    try {
      const { data: avail, error: aErr } = await supabase.rpc("username_available", { uname: username });
      if (aErr) throw aErr;
      if (!avail) throw new Error(t("username_taken"));
      const { error } = await supabase.from("profiles").update({ username }).eq("id", session.user.id);
      if (error) throw error;
      onDone(username);
    } catch (e) { setErr(e.message || t("save_failed")); } finally { setBusy(false); }
  }
  return (
    <div className="center-screen">
      <div className="card auth-card">
        <div className="brand-mark lg"><span className="dot" />{t("brand")}</div>
        <h2 style={{ margin: "14px 0 6px" }}>{t("choose_username_title")}</h2>
        <p className="muted auth-sub">{t("choose_username_sub")}</p>
        <label className="field"><span>{t("username")}</span><input value={username} onChange={(e) => setUsername(e.target.value)} placeholder={t("ph_username")} dir="ltr" onKeyDown={(e) => e.key === "Enter" && save()} /></label>
        {err && <div className="alert error">{err}</div>}
        <button className="btn primary block" onClick={save} disabled={busy}>{busy ? t("saving") : t("continue")}</button>
        <button className="btn link" onClick={() => supabase.auth.signOut()}>{t("logout")}</button>
      </div>
    </div>
  );
}

function Dashboard({ session, role, username, theme, onToggleTheme }) {
  const { t, toggle } = useI18n();
  const userId = session.user.id;
  const me = useMemo(() => ({ id: userId, username, role }), [userId, username, role]);
  const [shows, setShows] = useState([]);
  const [watched, setWatched] = useState(() => new Set());
  const [notesByEp, setNotesByEp] = useState({});
  const [epsByShow, setEpsByShow] = useState({});
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [view, setView] = useState("watching");
  const [statusFilter, setStatusFilter] = useState("all");
  const isAdmin = role === "admin";
  const isMod = role === "moderator";

  const watchingShows = useMemo(() => shows.filter((s) => (s.list || "watching") === "watching"), [shows]);
  const watchlistShows = useMemo(() => shows.filter((s) => s.list === "watchlist"), [shows]);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [{ data: showRows }, { data: watchedRows }, { data: noteRows }] = await Promise.all([
      supabase.from("tracked_shows").select("*").eq("user_id", userId).order("added_at", { ascending: false }),
      supabase.from("watched_episodes").select("episode_id").eq("user_id", userId),
      supabase.from("episode_notes").select("episode_id, rating").eq("user_id", userId),
    ]);
    setShows(showRows || []);
    setWatched(new Set((watchedRows || []).map((r) => r.episode_id)));
    const nmap = {};
    for (const n of noteRows || []) nmap[n.episode_id] = { rating: n.rating != null ? Number(n.rating) : null };
    setNotesByEp(nmap);
    setLoading(false);
  }, [userId]);
  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (!watchingShows.length) return;
    let cancelled = false;
    const queue = watchingShows.filter((s) => !(s.tvmaze_id in epsByShow));
    if (!queue.length) return;
    async function worker() {
      while (queue.length && !cancelled) {
        const s = queue.shift();
        try { const eps = await getEpisodes(s.tvmaze_id); if (!cancelled) setEpsByShow((prev) => ({ ...prev, [s.tvmaze_id]: eps })); }
        catch { if (!cancelled) setEpsByShow((prev) => ({ ...prev, [s.tvmaze_id]: [] })); }
      }
    }
    Promise.all([worker(), worker(), worker()]);
    return () => { cancelled = true; };
  }, [watchingShows]); // eslint-disable-line react-hooks/exhaustive-deps

  const addShow = useCallback(async (show, list) => {
    const row = { user_id: userId, tvmaze_id: show.id, name: show.name, image_url: show.image?.medium || null, status: show.status || null, list };
    const { data, error } = await supabase.from("tracked_shows").insert(row).select().single();
    if (error) { if (error.code === "23505") return { already: true }; alert(error.message); return { error: true }; }
    setShows((prev) => [data, ...prev]); return { added: true };
  }, [userId]);
  const moveToList = useCallback(async (showRow, list) => {
    const { data, error } = await supabase.from("tracked_shows").update({ list }).eq("id", showRow.id).select().single();
    if (error) return alert(error.message);
    setShows((prev) => prev.map((s) => (s.id === showRow.id ? data : s)));
  }, []);
  const removeShow = useCallback(async (showRow) => {
    await supabase.from("tracked_shows").delete().eq("id", showRow.id);
    await supabase.from("watched_episodes").delete().eq("tvmaze_id", showRow.tvmaze_id).eq("user_id", userId);
    const eps = epsByShow[showRow.tvmaze_id] || [];
    const ids = new Set(eps.map((e) => e.id));
    setWatched((prev) => new Set([...prev].filter((id) => !ids.has(id))));
    setShows((prev) => prev.filter((s) => s.id !== showRow.id));
    setSelected((cur) => (cur?.id === showRow.id ? null : cur));
  }, [epsByShow, userId]);
  const toggleWatched = useCallback(async (showRow, ep) => {
    const already = watched.has(ep.id);
    setWatched((prev) => { const next = new Set(prev); already ? next.delete(ep.id) : next.add(ep.id); return next; });
    if (already) {
      const { error } = await supabase.from("watched_episodes").delete().eq("episode_id", ep.id).eq("user_id", userId);
      if (error) { setWatched((prev) => new Set(prev).add(ep.id)); alert(error.message); }
    } else {
      const { error } = await supabase.from("watched_episodes").insert({ user_id: userId, tvmaze_id: showRow.tvmaze_id, episode_id: ep.id });
      if (error) { setWatched((prev) => { const n = new Set(prev); n.delete(ep.id); return n; }); alert(error.message); }
    }
  }, [watched, userId]);
  const markSeason = useCallback(async (showRow, episodes) => {
    const targets = episodes.filter((ep) => isAired(ep) && !watched.has(ep.id));
    if (!targets.length) return;
    setWatched((prev) => { const next = new Set(prev); targets.forEach((ep) => next.add(ep.id)); return next; });
    const rows = targets.map((ep) => ({ user_id: userId, tvmaze_id: showRow.tvmaze_id, episode_id: ep.id }));
    const { error } = await supabase.from("watched_episodes").insert(rows);
    if (error) { alert(error.message); loadData(); }
  }, [watched, userId, loadData]);
  const saveNote = useCallback(async (showRow, ep, rating) => {
    const row = { user_id: userId, tvmaze_id: showRow.tvmaze_id, episode_id: ep.id, rating, show_name: showRow.name, episode_code: episodeCode(ep) };
    const { data, error } = await supabase.from("episode_notes").upsert(row, { onConflict: "user_id,episode_id" }).select().single();
    if (error) return { error: error.message };
    setNotesByEp((prev) => ({ ...prev, [ep.id]: { rating: data.rating != null ? Number(data.rating) : null } }));
    return { ok: true };
  }, [userId]);
  const deleteNote = useCallback(async (ep) => {
    const { error } = await supabase.from("episode_notes").delete().eq("episode_id", ep.id).eq("user_id", userId);
    if (error) return alert(error.message);
    setNotesByEp((prev) => { const n = { ...prev }; delete n[ep.id]; return n; });
  }, [userId]);

  const pendingCount = useCallback((show) => {
    const eps = epsByShow[show.tvmaze_id];
    if (!eps) return null;
    return eps.filter((ep) => isAired(ep) && !watched.has(ep.id)).length;
  }, [epsByShow, watched]);
  const totalPending = useMemo(() => {
    let sum = 0, ready = true;
    for (const s of watchingShows) { const c = pendingCount(s); if (c === null) ready = false; else sum += c; }
    return { sum, ready };
  }, [watchingShows, pendingCount]);
  const newThisWeek = useMemo(() => {
    const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
    const items = [];
    for (const s of watchingShows) {
      const eps = epsByShow[s.tvmaze_id]; if (!eps) continue;
      for (const ep of eps) { const t2 = airTime(ep); if (t2 === null) continue; if (t2 <= Date.now() && t2 >= weekAgo) items.push({ show: s, ep }); }
    }
    items.sort((a, b) => airTime(b.ep) - airTime(a.ep));
    return items;
  }, [watchingShows, epsByShow]);
  const grouped = useMemo(() => {
    const filtered = watchingShows.filter((s) => statusFilter === "all" || s.status === statusFilter);
    const pending = [], done = [], loadingShows = [];
    for (const s of filtered) { const c = pendingCount(s); if (c === null) loadingShows.push(s); else if (c > 0) pending.push([s, c]); else done.push([s, c]); }
    pending.sort((a, b) => b[1] - a[1]);
    return { pending, done, loadingShows };
  }, [watchingShows, statusFilter, pendingCount]);

  function go(v) { setView(v); setSelected(null); }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand-mark"><span className="dot" />{t("brand")}</div>
        <nav className="tabs">
          <button className={`tab ${view === "watching" ? "active" : ""}`} onClick={() => go("watching")}>{t("tab_my_shows")}</button>
          <button className={`tab ${view === "watchlist" ? "active" : ""}`} onClick={() => go("watchlist")}>{t("tab_watchlist")}{watchlistShows.length > 0 && <span className="tab-count">{watchlistShows.length}</span>}</button>
          <button className={`tab ${view === "new" ? "active" : ""}`} onClick={() => go("new")}>{t("tab_new")}{newThisWeek.length > 0 && <span className="tab-count">{newThisWeek.length}</span>}</button>
          {isAdmin && <button className={`tab ${view === "admin" ? "active" : ""}`} onClick={() => go("admin")}>{t("tab_admin")}</button>}
          {isMod && <button className={`tab ${view === "moderation" ? "active" : ""}`} onClick={() => go("moderation")}>{t("tab_moderation")}</button>}
        </nav>
        <div className="topbar-actions">
          <span className="me-name" title={session.user.email}>{username}{isAdmin && <span className="me-badge">{t("badge_admin")}</span>}{isMod && <span className="me-badge mod">{t("badge_mod")}</span>}</span>
          <button className="btn ghost icon" onClick={toggle} title={t("toggle_lang")}>{t("toggle_lang")}</button>
          <button className="btn ghost icon" onClick={onToggleTheme} title={t("toggle_theme")}>{theme === "dark" ? "☀︎" : "☾"}</button>
          <button className="btn primary" onClick={() => setSearchOpen(true)}>{t("add_show")}</button>
          <button className="btn ghost" onClick={() => supabase.auth.signOut()}>{t("logout")}</button>
        </div>
      </header>

      <main className="content">
        {view === "admin" && isAdmin ? <AdminPanel session={session} />
        : view === "moderation" && isMod ? <ModeratorPanel />
        : selected ? (
          <ShowDetail showRow={selected} episodes={epsByShow[selected.tvmaze_id]} watched={watched} notesByEp={notesByEp} me={me}
            onBack={() => setSelected(null)} onToggle={toggleWatched} onMarkSeason={markSeason} onRemove={removeShow} onSaveNote={saveNote} onDeleteNote={deleteNote} />
        ) : loading ? <p className="muted">{t("loading")}</p>
        : view === "watching" ? (
          <WatchingView grouped={grouped} totalPending={totalPending} statusFilter={statusFilter} setStatusFilter={setStatusFilter}
            hasAny={watchingShows.length > 0} epsByShow={epsByShow} watched={watched} onOpen={setSelected} onAdd={() => setSearchOpen(true)} onMarkEp={toggleWatched} />
        ) : view === "watchlist" ? (
          <WatchlistView shows={watchlistShows} onStart={(s) => moveToList(s, "watching")} onRemove={removeShow} onAdd={() => setSearchOpen(true)} />
        ) : <NewThisWeekView items={newThisWeek} watched={watched} onToggle={toggleWatched} />}
      </main>

      {searchOpen && <SearchPanel onClose={() => setSearchOpen(false)} onAdd={addShow} tracked={new Set(shows.map((s) => s.tvmaze_id))} />}
    </div>
  );
}

function WatchingView({ grouped, totalPending, statusFilter, setStatusFilter, hasAny, epsByShow, watched, onOpen, onAdd, onMarkEp }) {
  const { t } = useI18n();
  if (!hasAny) return <EmptyState onAdd={onAdd} />;
  const { pending, done, loadingShows } = grouped;
  return (
    <>
      <div className="dash-head"><h1>{t("tab_my_shows")}</h1>
        <p className="muted">{totalPending.ready ? (totalPending.sum > 0 ? t("pending_summary", { n: totalPending.sum }) : t("all_caught")) : t("calculating")}</p>
      </div>
      <div className="filters">
        {[["all", t("filter_all")], ["Running", t("filter_running")], ["Ended", t("filter_ended")]].map(([val, label]) => (
          <button key={val} className={`chip ${statusFilter === val ? "active" : ""}`} onClick={() => setStatusFilter(val)}>{label}</button>
        ))}
      </div>
      {pending.length > 0 && <Group title={t("group_pending")}>{pending.map(([s, c]) => <ShowCard key={s.id} show={s} pending={c} nextEp={nextUnwatched(epsByShow[s.tvmaze_id], watched)} onOpen={() => onOpen(s)} onMarkNext={(ep) => onMarkEp(s, ep)} />)}</Group>}
      {done.length > 0 && <Group title={t("group_done")}>{done.map(([s]) => <ShowCard key={s.id} show={s} pending={0} nextEp={null} onOpen={() => onOpen(s)} />)}</Group>}
      {loadingShows.length > 0 && <Group title={t("group_calc")}>{loadingShows.map((s) => <ShowCard key={s.id} show={s} pending={null} nextEp={null} onOpen={() => onOpen(s)} />)}</Group>}
      {pending.length === 0 && done.length === 0 && loadingShows.length === 0 && <p className="muted">{t("none_in_filter")}</p>}
    </>
  );
}
function Group({ title, children }) { return <section className="group"><h2 className="group-title">{title}</h2><div className="show-grid">{children}</div></section>; }
function EmptyState({ onAdd }) { const { t } = useI18n(); return <div className="empty"><p>{t("empty_no_shows")}</p><button className="btn primary" onClick={onAdd}>{t("add_first")}</button></div>; }

function ShowCard({ show, pending, nextEp, onOpen, onMarkNext }) {
  const { t } = useI18n();
  return (
    <div className="show-card">
      <button className="show-card-main" onClick={onOpen}>
        <div className="poster">{show.image_url ? <img src={show.image_url} alt={show.name} loading="lazy" /> : <div className="poster placeholder">{t("no_image")}</div>}{pending !== null && pending > 0 && <span className="badge">{pending}</span>}</div>
        <div className="show-card-body"><span className="show-name">{show.name}</span><span className="show-status">{statusLabel(show.status, t)}{pending === null && <span className="mini-muted">{t("calc_dot")}</span>}{pending === 0 && <span className="mini-muted">{t("complete_dot")}</span>}</span></div>
      </button>
      {nextEp && (
        <div className="next-ep">
          <div className="next-ep-info"><span className="next-ep-label">{t("next")}</span><span className="next-ep-code">{episodeCode(nextEp)}</span><span className="next-ep-name">{nextEp.name || "—"}</span></div>
          <button className="btn tiny solid" onClick={(e) => { e.stopPropagation(); onMarkNext(nextEp); }}>{t("watched_btn")}</button>
        </div>
      )}
    </div>
  );
}

function WatchlistView({ shows, onStart, onRemove, onAdd }) {
  const { t } = useI18n();
  if (shows.length === 0) return <div className="empty"><p>{t("watchlist_empty")}</p><button className="btn primary" onClick={onAdd}>{t("search_add")}</button></div>;
  return (
    <>
      <div className="dash-head"><h1>{t("watchlist_title")}</h1><p className="muted">{t("watchlist_sub")}</p></div>
      <div className="show-grid">
        {shows.map((s) => (
          <div className="show-card" key={s.id}>
            <button className="show-card-main" onClick={() => onStart(s)}>
              <div className="poster">{s.image_url ? <img src={s.image_url} alt={s.name} loading="lazy" /> : <div className="poster placeholder">{t("no_image")}</div>}</div>
              <div className="show-card-body"><span className="show-name">{s.name}</span><span className="show-status">{statusLabel(s.status, t)}</span></div>
            </button>
            <div className="next-ep">
              <button className="btn tiny solid" onClick={() => onStart(s)}>{t("start_watching")}</button>
              <button className="btn tiny danger" onClick={() => { if (confirm(t("confirm_remove_watchlist", { name: s.name }))) onRemove(s); }}>{t("remove")}</button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function NewThisWeekView({ items, watched, onToggle }) {
  const { t, lang } = useI18n();
  return (
    <>
      <div className="dash-head"><h1>{t("new_title")}</h1><p className="muted">{t("new_sub")}</p></div>
      {items.length === 0 ? <p className="muted">{t("none_new")}</p> : (
        <ul className="ep-list wide">
          {items.map(({ show, ep }) => {
            const isWatched = watched.has(ep.id);
            return (
              <li key={ep.id} className={`ep ${isWatched ? "done" : ""}`}>
                <div className="ep-row">
                  <button className="ep-check" onClick={() => onToggle(show, ep)} aria-label={t("watched_btn")}>{isWatched ? "✓" : ""}</button>
                  <span className="ep-code">{episodeCode(ep)}</span>
                  <span className="ep-name"><strong className="ep-show">{show.name}</strong><span className="ep-sub">{ep.name || "—"}</span></span>
                  <span className="ep-date">{formatDate(ep.airdate, lang)}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function ShowDetail({ showRow, episodes, watched, notesByEp, me, onBack, onToggle, onMarkSeason, onRemove, onSaveNote, onDeleteNote }) {
  const { t } = useI18n();
  const [onlyAired, setOnlyAired] = useState(false);
  const [info, setInfo] = useState(null);
  useEffect(() => { let alive = true; setInfo(null); getShow(showRow.tvmaze_id).then((d) => alive && setInfo(d)).catch(() => {}); return () => { alive = false; }; }, [showRow.tvmaze_id]);

  const seasons = useMemo(() => {
    if (!episodes) return [];
    const map = new Map();
    for (const ep of episodes) { const key = ep.season ?? 0; if (!map.has(key)) map.set(key, []); map.get(key).push(ep); }
    for (const arr of map.values()) arr.sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [episodes]);
  const firstPendingSeason = useMemo(() => {
    for (const [no, eps] of seasons) if (eps.some((ep) => isAired(ep) && !watched.has(ep.id))) return no;
    return seasons.length ? seasons[seasons.length - 1][0] : null;
  }, [seasons, watched]);
  const summary = stripHtml(info?.summary);

  return (
    <div className="detail">
      <button className="btn link back" onClick={onBack}>{t("back")}</button>
      <div className="detail-head">
        {showRow.image_url && <img className="detail-poster" src={showRow.image_url} alt={showRow.name} />}
        <div className="detail-head-info">
          <h1>{showRow.name}</h1>
          <p className="muted">{statusLabel(showRow.status, t)}{info?.genres?.length ? ` · ${info.genres.join("، ")}` : ""}{info?.network?.name ? ` · ${info.network.name}` : ""}</p>
          {summary && <p className="summary">{summary}</p>}
          <div className="detail-controls">
            <label className="switch"><input type="checkbox" checked={onlyAired} onChange={(e) => setOnlyAired(e.target.checked)} /><span>{t("only_aired")}</span></label>
            <button className="btn ghost danger" onClick={() => { if (confirm(t("confirm_remove_show", { name: showRow.name }))) onRemove(showRow); }}>{t("remove_show")}</button>
          </div>
        </div>
      </div>
      {!episodes ? <p className="muted">{t("fetching_eps")}</p> : episodes.length === 0 ? <p className="muted">{t("no_eps")}</p> : (
        seasons.map(([seasonNo, eps]) => (
          <SeasonBlock key={seasonNo} seasonNo={seasonNo} eps={eps} watched={watched} notesByEp={notesByEp} showRow={showRow} me={me} onlyAired={onlyAired}
            defaultOpen={seasonNo === firstPendingSeason} onToggle={(ep) => onToggle(showRow, ep)} onMarkSeason={() => onMarkSeason(showRow, eps)}
            onSaveNote={(ep, rating) => onSaveNote(showRow, ep, rating)} onDeleteNote={onDeleteNote} />
        ))
      )}
    </div>
  );
}

function SeasonBlock({ seasonNo, eps, watched, notesByEp, showRow, me, onlyAired, defaultOpen, onToggle, onMarkSeason, onSaveNote, onDeleteNote }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => { setOpen(defaultOpen); }, [defaultOpen]);
  const aired = eps.filter(isAired);
  const watchedCount = aired.filter((ep) => watched.has(ep.id)).length;
  const pending = aired.length - watchedCount;
  const visible = onlyAired ? aired : eps;
  return (
    <section className={`season ${open ? "open" : "collapsed"}`}>
      <div className="season-head" role="button" tabIndex={0} onClick={() => setOpen((o) => !o)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setOpen((o) => !o)}>
        <span className={`caret ${open ? "down" : ""}`}>▸</span>
        <h2>{seasonNo === 0 ? t("special_eps") : t("season_n", { n: seasonNo })}</h2>
        <span className="season-meta">{watchedCount}/{aired.length} {t("aired_word")}</span>
        {pending === 0 && aired.length > 0 && <span className="season-done">{t("season_complete")}</span>}
        {pending > 0 && <button className="btn tiny" onClick={(e) => { e.stopPropagation(); onMarkSeason(); }}>{t("mark_all")}</button>}
      </div>
      <div className="season-track" aria-hidden="true">
        {eps.map((ep) => { const state = !isAired(ep) ? "upcoming" : watched.has(ep.id) ? "watched" : "pending"; return <span key={ep.id} className={`seg ${state}`} />; })}
      </div>
      {open && (
        <ul className="ep-list">
          {visible.map((ep) => (
            <EpisodeRow key={ep.id} ep={ep} aired={isAired(ep)} isWatched={watched.has(ep.id)} note={notesByEp[ep.id]} showRow={showRow} me={me}
              onToggle={() => onToggle(ep)} onSaveNote={(rating) => onSaveNote(ep, rating)} onDeleteNote={() => onDeleteNote(ep)} />
          ))}
        </ul>
      )}
    </section>
  );
}

function EpisodeRow({ ep, aired, isWatched, note, showRow, me, onToggle, onSaveNote, onDeleteNote }) {
  const { t, lang } = useI18n();
  const [openRating, setOpenRating] = useState(false);
  const [openComments, setOpenComments] = useState(false);
  const [rating, setRating] = useState(note?.rating || 0);
  useEffect(() => { setRating(note?.rating || 0); }, [note]);
  async function setStars(v) { setRating(v); await onSaveNote(v || null); }
  async function clearRating() { setRating(0); await onDeleteNote(); setOpenRating(false); }
  return (
    <li className={`ep ${isWatched ? "done" : ""}`}>
      <div className="ep-row">
        <button className="ep-check" disabled={!aired} onClick={onToggle} title={aired ? "" : t("tbd")} aria-label={t("watched_btn")}>{isWatched ? "✓" : ""}</button>
        <span className="ep-code">{episodeCode(ep)}</span>
        <span className="ep-name">{ep.name || "—"}</span>
        {aired ? (
          <>
            <button className={`ep-note-btn ${note?.rating ? "has" : ""}`} onClick={() => setOpenRating((o) => !o)}>{note?.rating ? <span className="rating-badge">★ {note.rating}</span> : t("rate")}</button>
            <button className="ep-note-btn" onClick={() => setOpenComments((o) => !o)}>{t("comments_btn")}</button>
          </>
        ) : (
          <span className="ep-date"><span className="pill upcoming">{ep.airdate ? t("airs_on", { date: formatDate(ep.airdate, lang) }) : t("tbd")}</span></span>
        )}
      </div>
      {openRating && aired && (
        <div className="ep-note-editor">
          <div className="note-row"><span className="note-label">{t("your_rating")}</span><StarRating value={rating} onChange={setStars} />{rating > 0 && <button className="btn small ghost" onClick={clearRating}>{t("delete_rating")}</button>}</div>
        </div>
      )}
      {openComments && aired && (
        <div className="ep-note-editor"><Comments tvmazeId={showRow.tvmaze_id} showName={showRow.name} ep={ep} episodeCodeStr={episodeCode(ep)} me={me} /></div>
      )}
    </li>
  );
}

function SearchPanel({ onClose, onAdd, tracked }) {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [addedIds, setAddedIds] = useState(() => new Set());
  useEffect(() => {
    const term = q.trim();
    if (!term) { setResults([]); setErr(null); return; }
    const id = setTimeout(async () => { setBusy(true); setErr(null); try { setResults(await searchShows(term)); } catch (e) { setErr(e.message); } finally { setBusy(false); } }, 350);
    return () => clearTimeout(id);
  }, [q]);
  async function handleAdd(show, list) { const res = await onAdd(show, list); if (res?.added || res?.already) setAddedIds((prev) => new Set(prev).add(show.id)); }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><h2>{t("add_show_title")}</h2><button className="btn ghost" onClick={onClose}>{t("close")}</button></div>
        <div className="search-row"><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search_ph")} />{busy && <span className="search-spinner">…</span>}</div>
        {err && <div className="alert error">{err}</div>}
        <div className="results">
          {results.map((show) => {
            const already = tracked.has(show.id) || addedIds.has(show.id);
            const summary = stripHtml(show.summary);
            return (
              <div className="result" key={show.id}>
                <div className="result-thumb">{show.image?.medium ? <img src={show.image.medium} alt={show.name} loading="lazy" /> : <div className="result-thumb placeholder">—</div>}</div>
                <div className="result-info">
                  <span className="result-name">{show.name}</span>
                  <span className="muted result-meta">{[show.premiered?.slice(0, 4), statusLabel(show.status, t), show.language].filter(Boolean).join(" · ")}</span>
                  {summary && <span className="result-summary">{summary}</span>}
                </div>
                <div className="result-actions">
                  {already ? <span className="added-tag">{t("added")}</span> : (<><button className="btn small" onClick={() => handleAdd(show, "watching")}>{t("follow")}</button><button className="btn small ghost" onClick={() => handleAdd(show, "watchlist")}>{t("to_watchlist")}</button></>)}
                </div>
              </div>
            );
          })}
          {!busy && q.trim() && results.length === 0 && !err && <p className="muted">{t("no_results")}</p>}
        </div>
      </div>
    </div>
  );
}
