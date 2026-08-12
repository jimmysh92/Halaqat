import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "./supabaseClient";
import { useI18n } from "./i18n.jsx";

export function AdminPanel({ session }) {
  const { t } = useI18n();
  const [profiles, setProfiles] = useState([]);
  const [showsByUser, setShowsByUser] = useState({});
  const [ratingsByUser, setRatingsByUser] = useState({});
  const [comments, setComments] = useState([]);
  const [banned, setBanned] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    const [p, ts, en, ec, bw] = await Promise.all([
      supabase.from("profiles").select("id, email, username, role, created_at"),
      supabase.from("tracked_shows").select("user_id"),
      supabase.from("episode_notes").select("user_id"),
      supabase.from("episode_comments").select("*").order("created_at", { ascending: false }),
      supabase.from("banned_words").select("*").order("word"),
    ]);
    if (p.error) setErr(p.error.message);
    setProfiles(p.data || []);
    setShowsByUser(countBy(ts.data || [], "user_id"));
    setRatingsByUser(countBy(en.data || [], "user_id"));
    setComments(ec.data || []);
    setBanned(bw.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const commentsByUser = useMemo(() => countBy(comments, "user_id"), [comments]);
  const emailById = useMemo(() => { const m = {}; for (const p of profiles) m[p.id] = p.email; return m; }, [profiles]);
  const stats = useMemo(() => ({
    users: profiles.length,
    admins: profiles.filter((p) => p.role === "admin").length,
    mods: profiles.filter((p) => p.role === "moderator").length,
    comments: comments.length,
  }), [profiles, comments]);

  async function setRole(userId, role) {
    const { error } = await supabase.from("profiles").update({ role }).eq("id", userId);
    if (error) return alert(error.message);
    setProfiles((prev) => prev.map((p) => (p.id === userId ? { ...p, role } : p)));
  }
  async function deleteAccount(userId, label) {
    if (userId === session.user.id) return alert("—");
    if (!confirm(t("confirm_delete_account", { label }))) return;
    const { data, error } = await supabase.functions.invoke("delete-user", { body: { target: userId } });
    if (error || data?.error) { alert(t("delete_account_failed") + (data?.error || error?.message || "")); return; }
    setProfiles((prev) => prev.filter((p) => p.id !== userId));
    setComments((prev) => prev.filter((c) => c.user_id !== userId));
  }
  async function deleteComment(id) {
    if (!confirm(t("confirm_delete_comment"))) return;
    const { error } = await supabase.from("episode_comments").delete().eq("id", id);
    if (error) return alert(error.message);
    setComments((prev) => prev.filter((c) => c.id !== id && c.parent_id !== id));
  }
  async function addBanned(word) {
    const w = word.trim().toLowerCase(); if (!w) return;
    const { data, error } = await supabase.from("banned_words").insert({ word: w }).select().single();
    if (error) { if (error.code === "23505") return; return alert(error.message); }
    setBanned((prev) => [...prev, data].sort((a, b) => a.word.localeCompare(b.word)));
  }
  async function removeBanned(id) {
    const { error } = await supabase.from("banned_words").delete().eq("id", id);
    if (error) return alert(error.message);
    setBanned((prev) => prev.filter((b) => b.id !== id));
  }

  if (loading) return <p className="muted">{t("loading_admin")}</p>;

  return (
    <div className="admin">
      <div className="dash-head">
        <h1>{t("admin_title")}</h1>
        {err && <p className="alert error" style={{ margin: "8px 0" }}>{err}</p>}
      </div>
      <div className="stat-grid">
        <StatCard label={t("stat_users")} value={stats.users} />
        <StatCard label={t("stat_comments")} value={stats.comments} />
        <StatCard label={t("stat_mods")} value={stats.mods} />
        <StatCard label={t("stat_admins")} value={stats.admins} />
      </div>

      <section className="admin-section">
        <h2>{t("sec_users")}</h2>
        <div className="table-wrap">
          <table className="admin-table">
            <thead><tr>
              <th>{t("th_user")}</th><th>{t("th_role")}</th><th>{t("th_shows")}</th><th>{t("th_ratings")}</th><th>{t("th_comments")}</th><th>{t("th_actions")}</th>
            </tr></thead>
            <tbody>
              {profiles.map((p) => {
                const isSelf = p.id === session.user.id;
                return (
                  <tr key={p.id}>
                    <td className="cell-user"><span className="cell-username">{p.username || "—"}</span><span className="cell-email">{p.email}</span></td>
                    <td><span className={`role-tag ${p.role}`}>{roleLabel(p.role, t)}</span></td>
                    <td>{showsByUser[p.id] || 0}</td>
                    <td>{ratingsByUser[p.id] || 0}</td>
                    <td>{commentsByUser[p.id] || 0}</td>
                    <td className="cell-actions">
                      {p.role !== "admin" && (p.role === "moderator"
                        ? <button className="btn tiny" onClick={() => setRole(p.id, "user")}>{t("unset_mod")}</button>
                        : <button className="btn tiny" onClick={() => setRole(p.id, "moderator")}>{t("set_mod")}</button>)}
                      {!isSelf && <button className="btn tiny danger" onClick={() => deleteAccount(p.id, p.username || p.email)}>{t("delete_account")}</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-section">
        <h2>{t("sec_comments")}</h2>
        <CommentsList comments={comments} emailById={emailById} onDelete={deleteComment} />
      </section>

      <section className="admin-section">
        <h2>{t("sec_banned")}</h2>
        <p className="muted small">{t("banned_hint")}</p>
        <BannedWords words={banned} onAdd={addBanned} onRemove={removeBanned} />
      </section>
    </div>
  );
}

export function ModeratorPanel() {
  const { t } = useI18n();
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from("episode_comments").select("*").order("created_at", { ascending: false })
      .then(({ data }) => { setComments(data || []); setLoading(false); });
  }, []);

  async function deleteComment(id) {
    if (!confirm(t("confirm_delete_comment"))) return;
    const { error } = await supabase.from("episode_comments").delete().eq("id", id);
    if (error) return alert(error.message);
    setComments((prev) => prev.filter((c) => c.id !== id && c.parent_id !== id));
  }

  return (
    <div className="admin">
      <div className="dash-head"><h1>{t("mod_title")}</h1><p className="muted">{t("mod_sub")}</p></div>
      {loading ? <p className="muted">{t("loading")}</p> : <CommentsList comments={comments} emailById={{}} onDelete={deleteComment} />}
    </div>
  );
}

function CommentsList({ comments, emailById, onDelete }) {
  const { t } = useI18n();
  if (comments.length === 0) return <p className="muted">{t("no_comments")}</p>;
  return (
    <ul className="comment-list">
      {comments.map((c) => (
        <li className="comment" key={c.id}>
          <div className="comment-body">
            <div className="comment-meta">
              <span className="comment-author">{c.author_username || t("user_fallback")}</span>
              {c.parent_id && <span className="comment-badge">{t("reply_tag")}</span>}
              <span className="comment-show">{c.show_name || `#${c.tvmaze_id}`}</span>
              {c.episode_code && <span className="comment-code">{c.episode_code}</span>}
              {emailById[c.user_id] && <span className="comment-user">{emailById[c.user_id]}</span>}
            </div>
            <p className="comment-text">{c.body}</p>
          </div>
          <button className="btn tiny danger" onClick={() => onDelete(c.id)}>{t("delete")}</button>
        </li>
      ))}
    </ul>
  );
}

function BannedWords({ words, onAdd, onRemove }) {
  const { t } = useI18n();
  const [val, setVal] = useState("");
  return (
    <div className="banned">
      <div className="banned-add">
        <input value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { onAdd(val); setVal(""); } }} placeholder={t("add_word_ph")} />
        <button className="btn small" onClick={() => { onAdd(val); setVal(""); }}>{t("add")}</button>
      </div>
      <div className="banned-tags">
        {words.length === 0 && <span className="muted small">{t("no_banned")}</span>}
        {words.map((b) => <span className="banned-tag" key={b.id}>{b.word}<button onClick={() => onRemove(b.id)} aria-label={t("remove")}>×</button></span>)}
      </div>
    </div>
  );
}

function StatCard({ label, value }) {
  return <div className="stat-card"><span className="stat-value">{value}</span><span className="stat-label">{label}</span></div>;
}
function countBy(rows, key) { const m = {}; for (const r of rows) m[r[key]] = (m[r[key]] || 0) + 1; return m; }
function roleLabel(role, t) {
  if (role === "admin") return t("role_admin");
  if (role === "moderator") return t("role_mod");
  return t("role_user");
}
