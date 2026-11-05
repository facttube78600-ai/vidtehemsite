# VidTheme

A clean video-browsing theme: black header with the **VidTheme** logo
and search, a row of 8 brand/category image slots, a black heading
bar, pagination above and below the grid, and video cards with a
16:9 thumbnail, a duration badge and a pale-teal title strip.
A video page has the classic embed player
(`.player > .embed-responsive.embed-responsive-16by9`, "Loading
Video…" + `iframe.embed-responsive-item`), tag links, related videos
and a Show more button. Tag pages use the same grid.

**No explicit content.** The 240 videos in `videos.json` are clean
placeholders (Nature, Travel, Food, Ocean Life, Mountains, City
Life, Winter, Sky). Replace them with the real catalogue when it
is decided — the site structure does not change.

## How it updates (static site, dynamic data)

The site is plain static HTML/CSS/JS. It does **not** need a
rebuild when a video is added:

- `index.html` / `assets/app.js` fetch `videos.json` from GitHub
  raw on **every** page load (with a cache-buster), falling back
  to the local `videos.json` if that fails. A new video in
  `videos.json` therefore appears on the homepage, tag pages,
  search and related videos immediately.
- 48 videos per page. Pagination: `1 2 3 4 5 6 7 … last` near the
  start, `1 … last-6 … last` near the end, current page in solid
  blue. Clean URLs via the History API:
  `/`, `/page/02.html`, `/video/<slug>-<id>.html`,
  `/tags/<slug>.html`, `/search?q=…`, `/terms`, `/privacy`,
  `/contact`, `/dmca`.
- Ad slots are **empty placeholders** in the same positions as
  the reference layout: homepage 3 (1 above the grid, 2 below),
  video page 6 (1 below the brand row, 3 stacked 300×250 between
  the tags and Related Videos, 2 below Related Videos). Put your
  own ad code in the `.ad-slot` containers in `assets/app.js`
  (`adWide()` / `adRect()`) when you are ready.
- Brand row: 8 image slots at
  `assets/images/brands/<tag-slug>.jpg` (284×126). Replace those
  8 files with your own brand/category images, keeping the same
  filenames. Thumbnails live in `assets/thumbs/`.

## Admin dashboard

Open `/admin.html`. It asks for the admin password (checked by
the server, not by the page), then lets you add, edit and delete
videos — title, duration, thumbnail, embed URL, categories and
date — with a live card preview. **Publish** sends
`{password, video}` to `POST /api/publish`; the server commits
the change to `videos.json` on GitHub and the public site picks
it up on the next load.

## Files

| File | What it is |
| --- | --- |
| `index.html` | The theme (CSS + header / brand row / footer). |
| `assets/app.js` | All front-end logic: dynamic `videos.json` load, grid, pagination, search, tags, video player, clean-URL routing. |
| `videos.json` | The video catalogue (240 clean placeholders). This is the file the admin publishes to. |
| `admin.html` | Standalone admin dashboard (password gate, local only). |
| `functions/api/publish.js` | Cloudflare Pages Function: checks `ADMIN_PASSWORD`, commits to `videos.json` via the GitHub Contents API. |
| `functions/[[path]].js` | Clean-URL router: serves `index.html` for video/tag/page/search/info URLs, passes through `/api/*`, `/admin.html`, `/videos.json`, `/assets/*`; real 404 for unknown paths. |
| `_redirects` | Same clean-URL rewrites for Cloudflare Pages. |
| `assets/thumbs/*.svg` | Placeholder 16:9 thumbnails. |
| `assets/images/brands/*.jpg` | The 8 brand-row images (replace with your own). |

## Deploy on Cloudflare Pages

1. Push this folder to a GitHub repository (branch `main`, root
   of the repo). Do **not** put any password or token in the repo.
2. Cloudflare dashboard → **Workers & Pages → Create → Pages →
   Connect to Git** → pick the repository.
3. Settings: **Framework preset: None**, **Build command: (empty)**,
   **Build output directory: (empty / root)**, **Root directory:
   (empty)**, branch `main`. Deploy. The site appears on a
   `*.pages.dev` URL.
4. The Pages Function in `functions/` deploys automatically with
   the site — no separate Worker is needed. (If you later want a
   custom domain, add it in the Pages project; DNS is unchanged
   by this repo.)

## Secrets — set these in Cloudflare, never in code

Cloudflare dashboard → your Pages project → **Settings →
Environment variables** (Production). The code only ever refers
to these names:

| Variable | Value to set |
| --- | --- |
| `ADMIN_PASSWORD` | The password you type in `/admin.html` when publishing. Pick a long one. |
| `GITHUB_TOKEN` | A GitHub **fine-grained** personal access token, **this repository only**, permission **Contents: Read and write**. It is only used by `functions/api/publish.js` to commit `videos.json`. |
| `GITHUB_REPO` | Optional. `owner/repo` — defaults to `facttube78600-ai/vidtehemsite`. |
| `GITHUB_BRANCH` | Optional. Defaults to `main`. |

Test the publish path after setting them: open `/admin.html`,
add a test video, Publish, then reload the homepage — the new
video should appear. If Publish says "Wrong admin password",
the `ADMIN_PASSWORD` variable is wrong; if it says the GitHub
commit failed, check the token's repository and Contents
permission.

## Local preview

```sh
python3 -m http.server 8000
# open http://localhost:8000/ — the local videos.json fallback is used
```
