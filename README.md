# Blythe River Reach — v2 (place picker + reliable forecast)

Live water dashboard for the Colorado River from Lake Havasu down to McIntyre.
Simple view by default; an Advanced button in the header reveals the full
sensor cards. Data arrives via a GitHub "data relay" robot (see below).

## What's in here

```
index.html                        the whole website (one file)
netlify.toml                      tells Netlify how to serve it
scripts/build-data.cjs            the data-fetcher the robot runs
.github/workflows/riverdata.yml   the robot: runs every hour on GitHub
data/riverdata.json               appears automatically after the first run
```

## How the forecast finally works

Your browser was never able to reliably fetch Reclamation's PDF (government
servers don't allow it cross-site, and free proxies are flaky). So instead, a
small robot **inside your GitHub repo** fetches the Reclamation feed and the
Headgate schedule PDF every hour — server-side, where there are no
restrictions — and saves the result as a small `data/riverdata.json` file.
The website just reads that file. No proxies, no server to babysit, free.

## Setup (one time, ~5 minutes)

1. **Edit one line in `index.html`.** Near the top of the script, find
   `var GH_REPO = "";` and put your repo name in it, for example:
   `var GH_REPO = "yourusername/yourrepo";`
   (It's the part of your repo's web address after `github.com/`.)

2. **Upload everything to your GitHub repo** — the same repo Netlify is
   already connected to. On the repo page: **Add file → Upload files**, then
   drag in ALL the contents of this folder, including the `scripts` and
   `.github` folders (folder names must stay exactly as they are — the robot
   lives at `.github/workflows/riverdata.yml`). Commit.

3. **Make sure the repo is Public** (Settings → General → Danger Zone shows
   visibility). Public repos get unlimited robot minutes, and the website
   reads the data file from GitHub's public file server.

4. **Wake the robot once.** On GitHub click the **Actions** tab (enable
   workflows if it asks) → **Update river data** → **Run workflow**. Wait a
   minute; you'll see a green check and a new `data/riverdata.json` in the
   repo. After this it runs itself every hour.

5. **Done.** Netlify auto-deploys the page from the repo like before. The
   hourly data commits are tagged `[skip netlify]` so they don't trigger
   rebuilds or use up your build minutes — the page reads the fresh data
   straight from GitHub.

## How to check it worked

- Page footer should say **Build 2026-07-04a (v2)**.
- After the page loads, the "Updated" line in the header shows
  **"· relay Xm old"** — that means it's using the robot's data. If you don't
  see it, the page fell back to the old proxy method (check GH_REPO spelling,
  repo visibility, and that the Action ran green).

## The place list

The dropdown covers Lake Havasu down to McIntyre, grouped by which stretch of
river each spot sits on, because the water behaves differently in each:

- **The lake** — no daily tide; the page shows what the dam is releasing.
- **Parker Strip** — gets the FULL Parker release (it's above the CRIT canal).
- **Headgate → diversion dam** — Parker release minus the CRIT canal.
- **Below the diversion dam** — same water minus what Palo Verde is pulling
  out (the page estimates today's diversion from the sensors automatically).

River miles marked "(est.)" in the dropdown are my estimates from the listed
order; everything else is from Reclamation's official river-mile index. To
correct an estimate, edit its `mile` number in the `PLACES` list at the top
of `index.html` — one mile ≈ 15 minutes of pulse travel at 4 mph.

## Branches

- **main** — the live site (Netlify deploys this; the robot commits data here).
- **testing** — a scratch copy for trying changes. Edit files there first; when
  you like the result, open a pull request on GitHub to merge into main.

## Good to know

- GitHub pauses hourly robots after ~60 days with no repo activity. The
  robot's own commits count as activity, so it keeps itself alive — but if
  the data ever goes stale, just open Actions and press Run workflow again.
- The hourly run can drift a few minutes; that's normal for GitHub.
- If GitHub or the robot is ever down, the page automatically falls back to
  the old proxy method, so you're never worse off than before.
