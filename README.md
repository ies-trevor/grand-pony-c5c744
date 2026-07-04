# Blythe River Reach — v2 (place picker + reliable forecast)

Live water dashboard for the Colorado River between Parker Dam and Blythe.
New in v2: a place picker (Lost Lake → Rancho Not So Grande), a dependable
forecast via a GitHub "data relay", and nicer loading.

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

## Fixing the place list (please do this!)

At the top of `index.html` there's a `PLACES` list. Each place has a river
mile (higher number = further upstream). **Lost Lake (162.3) and Water Wheel
(151.6) are from Reclamation's official river-mile index; the rest are my
estimates based on the order you listed them.** If Shaggy Tree is actually
upstream of Water Wheel, or the spacing is off, just change the numbers —
one mile ≈ 15 minutes of pulse travel.

Also near the top: `var WAVE_MPH = 4;` — how fast a dam pulse moves
downstream. To calibrate: watch one high pass the Water Wheel sensor on the
site, note when that high actually reaches your dock, and nudge the number
until the predicted times match reality. Bigger number = pulses arrive sooner.

## Good to know

- GitHub pauses hourly robots after ~60 days with no repo activity. The
  robot's own commits count as activity, so it keeps itself alive — but if
  the data ever goes stale, just open Actions and press Run workflow again.
- The hourly run can drift a few minutes; that's normal for GitHub.
- If GitHub or the robot is ever down, the page automatically falls back to
  the old proxy method, so you're never worse off than before.
