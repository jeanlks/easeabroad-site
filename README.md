# easeabroad.app

Static landing page for EaseAbroad, served by GitHub Pages (branch `main`, root) at https://easeabroad.app.
Plain HTML/CSS, no build step. Preview locally: `python3 -m http.server 8000`.

- `index.html` + `landing.css` (+ shared `style.css`): landing page
- `privacy/`, `terms/`: static legal pages (canonical copies also at https://api.easeabroad.app/privacy/ and /terms/)
- `CNAME`: custom domain `easeabroad.app`

Source of truth: `docs/site/` in the private app repo.
