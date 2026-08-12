import { useEffect, useState, useCallback } from "react";
import { supabase } from "./supabaseClient";
import { useI18n } from "./i18n.jsx";

function timeAgo(iso, t, lang) {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return t("t_now");
  if (diff < 3600) return t("t_min", { n: Math.floor(diff / 60) });
  if (diff < 86400) return t("t_hour", { n: Math.floor(diff / 3600) });
  if (diff < 604800) return t("t_day", { n: Math.floor(diff / 86400) });
  return d.toLocaleDateString(lang === "ar" ? "ar" : "en", { year: "numeric", month: "short", day: "numeric" });
}

export default function Comments({ tvmazeId, showName, ep, episodeCodeStr, me }) {
  const { t, lang } = useI18n();
  const [rows, setRows] = useState([]);
  const [likes, setLikes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState(null);
  const [replyBody, setReplyBody] = useState("");
  const [err, setErr] = useState(null);
  const canModerate = me.role === "admin" || me.role === "moderator";

  const load = useCallback(async () => {
    setLoading(true);
    const { data: crows } = await supabase
      .from("episode_comments").select("*").eq("episode_id", ep.id).order("created_at", { ascending: true });
    const list = crows || [];
    setRows(list);
    const ids = list.map((r) => r.id);
    if (ids.length) {
      const { data: lrows } = await supabase.from("comment_likes").select("comment_id, user_id").in("comment_id", ids);
      setLikes(lrows || []);
    } else setLikes([]);
    setLoading(false);
  }, [ep.id]);

  useEffect(() => { load(); }, [load]);

  async function add(text, parentId) {
    const clean = text.trim();
    if (!clean) return { ok: true };
    const row = {
      user_id: me.id, author_username: me.username, tvmaze_id: tvmazeId, episode_id: ep.id,
      parent_id: parentId || null, body: clean, show_name: showName, episode_code: episodeCodeStr,
    };
    const { error } = await supabase.from("episode_comments").insert(row);
    if (error) {
      if ((error.message || "").includes("COMMENT_BLOCKED")) return { error: t("blocked_word") };
      return { error: error.message };
    }
    await load();
    return { ok: true };
  }

  async function submitTop() { setErr(null); const res = await add(body); if (res.error) return setErr(res.error); setBody(""); }
  async function submitReply(parentId) { setErr(null); const res = await add(replyBody, parentId); if (res.error) return setErr(res.error); setReplyBody(""); setReplyTo(null); }

  async function del(id) {
    if (!confirm(t("confirm_delete_comment"))) return;
    const { error } = await supabase.from("episode_comments").delete().eq("id", id);
    if (error) return alert(error.message);
    setRows((prev) => prev.filter((r) => r.id !== id && r.parent_id !== id));
    setLikes((prev) => prev.filter((l) => l.comment_id !== id));
  }

  async function toggleLike(id) {
    const mine = likes.some((l) => l.comment_id === id && l.user_id === me.id);
    setLikes((prev) => mine ? prev.filter((l) => !(l.comment_id === id && l.user_id === me.id)) : [...prev, { comment_id: id, user_id: me.id }]);
    if (mine) {
      const { error } = await supabase.from("comment_likes").delete().eq("comment_id", id).eq("user_id", me.id);
      if (error) load();
    } else {
      const { error } = await supabase.from("comment_likes").insert({ comment_id: id, user_id: me.id });
      if (error) load();
    }
  }

  const tops = rows.filter((r) => !r.parent_id);
  const repliesOf = (id) => rows.filter((r) => r.parent_id === id);
  const likeCount = (id) => likes.filter((l) => l.comment_id === id).length;
  const iLike = (id) => likes.some((l) => l.comment_id === id && l.user_id === me.id);

  function CommentNode({ c, isReply }) {
    return (
      <div className={`cmt ${isReply ? "reply" : ""}`}>
        <div className="cmt-head">
          <span className="cmt-author">{c.author_username || t("user_fallback")}</span>
          <span className="cmt-time">{timeAgo(c.created_at, t, lang)}</span>
        </div>
        <p className="cmt-body">{c.body}</p>
        <div className="cmt-actions">
          <button className={`cmt-like ${iLike(c.id) ? "on" : ""}`} onClick={() => toggleLike(c.id)}>👍 {likeCount(c.id) > 0 ? likeCount(c.id) : ""}</button>
          {!isReply && <button className="cmt-reply-btn" onClick={() => { setReplyTo(replyTo === c.id ? null : c.id); setReplyBody(""); }}>{t("reply")}</button>}
          {(c.user_id === me.id || canModerate) && <button className="cmt-del" onClick={() => del(c.id)}>{t("delete")}</button>}
        </div>
        {!isReply && replyTo === c.id && (
          <div className="cmt-reply-box">
            <textarea value={replyBody} onChange={(e) => setReplyBody(e.target.value)} placeholder={t("reply_ph")} rows={2} />
            <div className="cmt-reply-actions">
              <button className="btn small primary" onClick={() => submitReply(c.id)}>{t("reply")}</button>
              <button className="btn small ghost" onClick={() => setReplyTo(null)}>{t("cancel")}</button>
            </div>
          </div>
        )}
        {!isReply && repliesOf(c.id).map((r) => <CommentNode key={r.id} c={r} isReply />)}
      </div>
    );
  }

  return (
    <div className="comments">
      <div className="cmt-add">
        <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder={t("share_ph")} rows={2} />
        <button className="btn small primary" onClick={submitTop}>{t("post")}</button>
      </div>
      {err && <div className="alert error" style={{ margin: "0 0 8px" }}>{err}</div>}
      {loading ? <p className="muted small">{t("loading_comments")}</p>
        : tops.length === 0 ? <p className="muted small">{t("no_comments_yet")}</p>
        : <div className="cmt-list">{tops.map((c) => <CommentNode key={c.id} c={c} isReply={false} />)}</div>}
    </div>
  );
}
