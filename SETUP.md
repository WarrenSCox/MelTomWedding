# Wedding Photo App — Setup

This is a mobile-first shared wedding photo gallery. Guests enter their name + wedding code, upload pictures and see everyone else's pictures.

## 1. Create the free backend
Go to Supabase and create a new project.

Open **SQL Editor** and run everything in `supabase.sql`.

## 2. Add your keys
In Supabase go to **Project Settings → API**.

Open `config.js` and replace:
- `YOUR_SUPABASE_URL`
- `YOUR_SUPABASE_ANON_KEY`

The anon key is designed to be used in a browser. Access is controlled by Supabase row-level-security policies.

## 3. Personalise it
In `config.js`, change:
- `weddingCode`
- `coupleName`
- `weddingDateText`

## 4. Put it online
The folder is static and can be hosted on Netlify, Vercel, Cloudflare Pages or GitHub Pages.

For the easiest route, drag this folder into Netlify Drop after adding your Supabase details.

## Important privacy note
The current MVP uses a shared wedding code in the browser as a friendly guest gate. The Supabase bucket itself is public so image URLs can be displayed without individual user accounts. For a genuinely private gallery, the next version should use authenticated guest sessions plus a private storage bucket and signed image URLs.
