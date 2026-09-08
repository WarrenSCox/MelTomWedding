# Tom & Mel Wedding App · v3

A mobile-first wedding photo and information app for **Tom & Mel · 10 September 2026**.

## v3 changes
- Completely restyled to mirror the invitation: warm ivory paper, black editorial serif type, handwritten “and”, muted botanical greens and fine-line styling.
- No login or wedding-code screen: guests go directly into the gallery.
- Gallery and multi-photo upload remain the main experience.
- New **Wedding Info** page with venue, full timeline, accommodation, taxi and dietary information from the invitation.
- New dedicated **Save App** page plus PWA install support.
- Bottom mobile navigation: Gallery / Info / Save App.
- No generated artwork is included in this release.

## Publishing
Upload the contents of this folder to the root of the separate GitHub repository and allow GitHub Pages to rebuild.

## Photo backend
See `SETUP.md` to connect Supabase. If `config.js` still contains `YOUR_SUPABASE_URL`, the UI works but photos cannot yet be uploaded/shared.
