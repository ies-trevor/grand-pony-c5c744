# Blythe River Reach — live dashboard

A one-page dashboard for your stretch of the Colorado River (33°57′53″N 114°30′03″W),
just north of Blythe and upstream of the Palo Verde Diversion Dam.

## What it shows

- **Live sensors** — Reclamation's hourly sensors along your reach (Water Wheel ~2 mi
  away, the I-10 bridge at Blythe, Taylor Ferry) plus the one genuinely live USGS gauge,
  "below Palo Verde Dam." Two nearby USGS gauges are *not* shown because they aren't live:
  09429010 "at Palo Verde Dam" was discontinued in 1991, and 09427520 "below Parker Dam"
  isn't serving real-time data. Reclamation instruments this stretch, not USGS.
- **Rising / falling headline** — read from the gauge closest to you, plus what's coming
  down from Parker.
- **Reclamation reach model** — the last 7 days of *hourly* flow at Reclamation's
  "Water Wheel" model site, which sits ~2 miles from your house. Pulled by a small
  serverless function so it isn't blocked by the browser.
- **Coming toward you (forecast)** — the projected hourly flow leaving Headgate Rock Dam
  (~29 river miles upstream), from Reclamation's schedule PDF, minus the CRIT canal
  diversion — i.e. the water actually headed down to you for the next ~4 days, with next
  high/low. Reaches your dock with roughly a day's lag. **Requires a Git/CLI deploy**
  (see below), since parsing the PDF needs a dependency.
- **Tide table** — the daily highs and lows (time + level) at your reach, with the next
  few projected from the recent rhythm. Times are Arizona (MST).
- **Level alerts** — pick a gauge, a direction, and a level; get a browser notification
  when it crosses (while the page is open).

## Files

```
blythe-river-site/
├── index.html                     the dashboard (open-and-go)
├── netlify.toml                   Netlify config + /api routes + function bundler
├── package.json                   declares pdf-parse (for the Headgate forecast)
└── netlify/functions/
    ├── reclamation.js             server-side fetch of Reclamation's hourly feed
    └── headgate.js                parses the Headgate schedule PDF (forecast)
```

## Deploy to Netlify

One thing to know first: the **Headgate forecast** needs the `pdf-parse` dependency, which
only gets installed on a Git or CLI deploy (they run `npm install`). A bare drag-and-drop
skips that step — everything else still works, but the forecast panel will show a fallback
link. So pick based on whether you want the forecast:

**Full version — Git or CLI (recommended, installs the forecast)**
- `npm i -g netlify-cli`, then from inside the folder: `netlify deploy --prod`
  (Netlify runs `npm install`, so `pdf-parse` is bundled and the forecast works), **or**
- Push the folder to a repo and "Import from Git" in Netlify.

**Quickest — drag and drop (everything except the Headgate forecast)**
1. Go to https://app.netlify.com/drop
2. Drag the whole `blythe-river-site` folder onto the page.
3. You get a live URL. On your phone, open it and "Add to Home Screen."

The reach data and the live gauge don't need any dependency — only the Headgate PDF parser does.

### Opening it locally
`index.html` works if you double-click it, **except** the two Reclamation panels (reach model
and Headgate forecast), which need the serverless functions — run `netlify dev` for those. The
live USGS gauge, tide table (falls back to the USGS gauge), and alerts all work locally.

## Troubleshooting

**Both Reclamation panels show a fallback after deploying.** The functions are failing. Check
Netlify → your site → **Logs → Functions** (or Deploys → the deploy → Functions) for the real
error:
- `pdf-parse` "Cannot find module" → you deployed by drag-and-drop, so nothing ran `npm install`.
  The reach feed will still work; the Headgate forecast needs a CLI/Git deploy. Run
  `netlify deploy --prod` from inside the folder.
- `HTTP 403` on the Reclamation fetch → Reclamation blocked the request from Netlify's servers;
  tell me and I'll route it differently.
- A function that 404s at `/api/...` → the redirect or function didn't deploy; redeploy via CLI.

The functions use Node's built-in `https`, so they don't depend on a particular Node version.

## Customizing

- **Reach sensors:** the `REACH` array in `reclamation.js` lists the sites to surface
  (matched by name substring). Add or rename entries — e.g. tune the `i10` / `taylor`
  matches if they show up under different names in the feed.
- **Live USGS gauge:** the `USGS_ID` variable near the top of the `<script>` in `index.html`.
- **Refresh rate:** the `setInterval(loadAll, 15*60*1000)` line (milliseconds).
- **Colors/type:** the CSS variables in the `:root` block.

## Good to know

- Data is **provisional** (both USGS and Reclamation label it so) and can be revised.
- This is **not a flood-warning system** — it reflects managed dam releases, not storm runoff.
- Alerts fire only while the page is open; a static site can't push when it's fully closed.
- Reading and tide times are shown in **Arizona (MST)**, matching Reclamation's own schedule.

## Sources

- USGS Instantaneous Values: https://waterservices.usgs.gov/
- Reclamation Lower Colorado river operations: https://www.usbr.gov/lc/riverops.html
- Parker Dam projected schedule (PDF): https://www.usbr.gov/lc/region/g4000/hourly/DavisParkerSchedules.pdf
