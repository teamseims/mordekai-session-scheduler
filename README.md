# The Council of Convening

A D&D session scheduler for **Mordekai's Broken Seal**, themed to match the
Wrencoria battle tracker (dark parchment, gold accents, MedievalSharp /
Cinzel typography).

Players mark which days they're available, maybe-available, or unavailable.
The app ranks dates by the gathering of wills (Available = 2, Maybe = 1)
and lets anyone seal a chosen session.

## Setup

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually `http://localhost:5173`).

To build for production:

```bash
npm run build
npm run preview
```

The built site lives in `dist/` and is fully static — drop it on Netlify,
Vercel, GitHub Pages, or any static host.

## ⚠️ Storage caveat — read this before deploying

The original artifact version used Claude's `window.storage` API, which
provides shared storage across users. **That API does not exist outside of
Claude artifacts.** This repo uses a `localStorage` shim instead
(`src/storage.js`) so the app runs locally with no backend.

**What this means in practice:**
- Each player's votes live only on their own device/browser.
- Players will *not* see each other's availability.
- Clearing browser storage wipes all data.

**To make it actually shared across the party**, replace `src/storage.js`
with a real backend. Easiest options:

- **Firebase Realtime Database** or **Firestore** — free tier is plenty for
  6 players. ~30 lines to swap in.
- **Supabase** — Postgres + auth, also a generous free tier.
- **A tiny Node + SQLite server** if you want to self-host.

The `storage.js` module exposes the same async `get` / `set` / `delete` /
`list` interface the component already uses, so swapping is a matter of
rewriting that one file.

## Editing the party

Player names live in `src/Scheduler.jsx`:

```js
const PARTY = ['BigTimeDM', 'King Gizzard', 'Lucien', 'Shio', 'Kazzak', 'Fazula'];
```

## Tech

- Vite + React 18
- Tailwind CSS (utility classes only)
- lucide-react (icons)
- Google Fonts: Cinzel, Cinzel Decorative, MedievalSharp (loaded via `<link>`)

## License

Private — for the Wrencoria campaign.
