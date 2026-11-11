# Our Little Vrindavan 🦚

A private, interactive scrapbook for exactly two people.

> Every date becomes a memory. Every memory becomes a story.
> And every story becomes another reason to fall in love.

React + Vite + TypeScript + Tailwind + Motion on the front, Supabase (auth, Postgres,
private storage) behind it, hosted as a static site on GitHub Pages.

**What is built so far**

| Phase | Status | What it covers |
| --- | --- | --- |
| 1. Foundation | Done | Theme, welcome experience, invite-only sign-in, private data access, navigation, settings |
| 2. Core memories | Done | Add Memory, multi-photo upload, gallery, memory pages, notes from both, timeline |
| 3. Communication | Next | Love letters, little notes, reactions |
| 4. Shared experiences | Later | Special dates, countdowns, bucket list |
| 5. Romantic polish | Later | Surprises, On This Day, hidden details |

---

## Setup checklist

Do these once, in order. Roughly 15 minutes.

### 1. Create the database (Supabase → SQL Editor)

Run the two files in `supabase/migrations/` **in order** — paste each into a new query and press Run:

1. `20261111000100_foundation.sql`
2. `20261111000200_memories.sql`

Both are safe to run more than once. (If your Supabase project is linked to this GitHub repo
and already applied them, you will see `memories` in the Table Editor — running them again
does no harm.)

### 2. Create your space and put yourself on the guest list

Still in the SQL Editor, with **your own** email:

```sql
select public.setup_couple_space('you@example.com');
```

### 3. Lock the front door (Authentication → Sign In / Providers)

- **Allow new users to sign up: OFF.** This is the important one — nobody can create an account.
- **Email provider: ON**, with **Confirm email: ON**.
- Leave every other provider off.

### 4. Create your account (Authentication → Users → Add user → Create new user)

- Email: the same one you used in step 2.
- Password: any long random string. You will never use it; you sign in with emailed codes.
- Tick **Auto Confirm User**.

### 5. Tell Supabase where the site lives (Authentication → URL Configuration)

- **Site URL:** `https://haitish-astro.github.io/Vrindavan/`
- **Redirect URLs:** add `https://haitish-astro.github.io/Vrindavan/` and `http://localhost:5173/`

### 6. Put the sign-in code in the email (Authentication → Emails → Magic Link)

Replace the template body with this, so the email carries both a code and a link:

```html
<h2>Our Little Vrindavan</h2>
<p>Your key to the garden:</p>
<p style="font-size:28px;letter-spacing:6px"><strong>{{ .Token }}</strong></p>
<p>Or <a href="{{ .ConfirmationURL }}">tap here to enter</a>.</p>
<p>This key expires soon. If you did not ask for it, ignore this email.</p>
```

Supabase's built-in email service only sends a few emails per hour. That is plenty for two
people; if codes ever stop arriving, wait a little or add your own SMTP provider.

### 7. Connect GitHub Pages (this repo → Settings)

- **Pages → Build and deployment → Source: GitHub Actions.**
- **Secrets and variables → Actions → Variables tab → New repository variable**, twice:

  | Name | Value |
  | --- | --- |
  | `VITE_SUPABASE_URL` | your Project URL, e.g. `https://xxxx.supabase.co` |
  | `VITE_SUPABASE_ANON_KEY` | the **anon / publishable** key (Project Settings → API) |

- **Actions → Deploy to GitHub Pages → Run workflow** (or push any commit).

The site appears at `https://haitish-astro.github.io/Vrindavan/`.

### 8. Later: invite her

When the surprise is ready:

```sql
select public.setup_couple_space('you@example.com', 'her@example.com');
```

Then repeat step 4 with her email. She opens the site, enters her email, and types the code.
A space holds exactly two people — the database refuses a third.

---

## Local development

```bash
npm install
cp .env.example .env.local   # then fill in the two values
npm run dev                  # http://localhost:5173
npm run build                # type-check + production build into dist/
npm run preview              # serve the production build
```

If `.env.local` has no key, `npm run dev` starts in **preview mode**: an in-memory copy of the
app where any email and code work and nothing is saved. That code is stripped from production
builds — a deployed site without keys just shows an "Almost ready" page.

---

## How it stays private

The GitHub Pages URL and this code are public. The data is not.

- **No public sign-up.** Sign-ups are disabled in Supabase, and the app only ever asks to sign
  in existing accounts (`shouldCreateUser: false`).
- **A guest list in the database.** `space_invites` holds the two allowed emails. No browser can
  read or write it. Membership is granted only by `claim_membership()`, which checks the
  signed-in user's *verified* email against that list.
- **Row Level Security on every table.** Each policy requires membership of the same couple
  space; visitors who are not signed in have no table privileges at all. Each person can only
  edit or delete what they wrote; your note on a memory and hers are separate rows.
- **Private photo bucket.** Photos live under `<space_id>/…` in a non-public bucket and are only
  reachable through one-hour signed links requested while a member is signed in. Photos are
  re-encoded in the browser before upload, which also removes GPS/EXIF data.
- **No secrets in the browser.** Only the Supabase URL and anon key ship to the client. The
  `service_role` key is never used by this project — do not add it anywhere.
- **Strict Content-Security-Policy** in production: the page can only load its own files and
  talk to your Supabase project. Fonts are self-hosted; there are no analytics or third parties.
- **No passwords in the app.** Sign-in is a one-time emailed code.

Things only you can do, from the Supabase dashboard: change who is on the guest list, remove a
member, or delete the space.

---

## Making it yours

| To change | Edit |
| --- | --- |
| Names, the day you met, greetings, home-page note | In the app: Our World → Our Details |
| Daily thoughts | `src/lib/dailyMessages.ts` |
| Colours and fonts | the `@theme` block in `src/index.css` |
| Feather, lotus, petals | `src/components/Decor.tsx` |
| Memory symbols | `SYMBOLS` in `src/pages/MemoryForm.tsx` |

## Project layout

```
supabase/migrations/   SQL: tables, Row Level Security, storage policies
src/data/api.ts        the single interface between the app and its data
src/data/supabaseApi.ts  the real implementation
src/data/demoApi.ts    local preview stand-in (never shipped)
src/app/AppContext.tsx who is signed in, and "our world"
src/pages/             Welcome, Login, Home, Memories, MemoryForm, MemoryDetail, Story, World, Settings
src/components/        decorations, layout, shared UI
src/lib/               dates, image compression, daily thoughts, hooks
```

Never commit `.env.local`, photos, or anything personal to this repository.
