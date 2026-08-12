# Halaqat

A series-tracking web app built end to end — authentication, authorisation, social
features, and moderation — with security enforced at the database layer rather than
the interface.

**Live:** https://halaqat-tv.netlify.app

---

## Why this exists

I wanted a tracker that answered one question well: *what am I behind on?*
Most trackers show you a library. This one shows you a queue.

It also became the project where I stopped taking shortcuts at the authorisation
layer, which is the part of this codebase I'd point at first.

## What it does

- **Pending-episode dashboard** — every followed series with a count of what you
  haven't watched, sorted by what's most overdue
- **Season accordion** — completed seasons collapse automatically, so the screen
  shows what's live rather than what's finished
- **Watch-later list** and a **new this week** view
- **Half-star ratings**
- **Threaded comments** on episodes, with replies and likes
- **Three-tier roles** — user, moderator, admin

## The parts worth reading

### Authorisation is in the database, not the UI

Every table is protected by Row Level Security policies. Hiding a button in React is
a UI convenience; it is not access control. A user who opens the browser console
cannot reach another user's rows, because the database refuses them regardless of
what the client asks for.

### Content moderation as a database trigger

The banned-word filter runs as a trigger on the comments table. Client-side
filtering can be bypassed by anyone willing to call the API directly. Putting it in
the trigger means it applies to every write path that will ever exist, including
ones I haven't written yet.

### Login by email *or* username

Supabase Auth signs in by email. Supporting usernames without weakening that meant a
`SECURITY DEFINER` RPC that resolves a username to its account, so the convenience
lives in one audited function rather than being scattered through the client.

### Account deletion as an Edge Function

Deleting a user touches auth records the client must never be allowed to reach. It
runs server-side in a Supabase Edge Function, with the service role key read from the
environment at runtime — never committed, never shipped to the browser.

## Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | React + Vite | Fast builds, no framework overhead for an SPA |
| Backend | Supabase (PostgreSQL) | RLS, triggers, RPC and auth in one place |
| Hosting | Netlify | Zero-config deploys from git |
| Data | TVmaze API | Open, no key required |

## Running locally

```bash
git clone https://github.com/jimmysh92/Halaqat.git
cd Halaqat
npm install
cp .env.example .env      # add your Supabase URL and anon key
npm run dev
```

The `anon` key is safe to expose in the client — it is protected by the Row Level
Security policies above. The `service_role` key is used only inside the Edge
Function and is read from the environment at runtime.

## Status

Live and in use. Built and maintained solo.

---

Built by [Jamal Shahwan](https://jamalshahwan.netlify.app) — I build internal tools,
dashboards and web apps with real logic behind them.
