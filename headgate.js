// Parses Reclamation's Headgate Rock Dam schedule PDF (forward hourly forecast) and
// returns downstream flow = PARKER - CRIT. Uses Node https (any version) + pdf-parse.
// pdf-parse is declared "external" in netlify.toml, so it ships when node_modules is
// installed (Git/CLI deploy). On a bare drag-and-drop it won't be present and this
// function returns an error the page handles gracefully.

const https = require("https");
const SOURCE = "https://www.usbr.gov/lc/region/g4000/hourly/HeadgateReport.pdf";
const MONTHS = { january:0, february:1, march:2, april:3, may:4, june:5, july:6, august:7, september:8, october:9, november:10, december:11 };

function fetchBuffer(url, redirects) {
  redirects = redirects || 0;
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "blythe-river-dashboard", Accept: "*/*" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects < 4) {
        res.resume();
        const next = res.headers.location.startsWith("http") ? res.headers.location : new URL(res.headers.location, url).toString();
        return resolve(fetchBuffer(next, redirects + 1));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error("HTTP " + res.statusCode)); }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
    }).on("error", reject);
  });
}
function mstEpoch(monthName, day, year, hour) {
  const mo = MONTHS[monthName.toLowerCase()];
  if (mo == null) return null;
  return Date.UTC(year, mo, day, hour, 0, 0) + 7 * 3600 * 1000;
}

exports.handler = async () => {
  const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=1800" };
  try {
    const pdf = require("pdf-parse/lib/pdf-parse.js");
    const buf = await fetchBuffer(SOURCE);
    const text = (await pdf(buf)).text;
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

    const dateRe = /^(sunday|monday|tuesday|wednesday|thursday|friday|saturday),\s+([a-z]+)\s+(\d+),\s+(\d+)/i;
    const dates = [];
    lines.forEach((l) => { const m = l.match(dateRe); if (m) dates.push({ month: m[2], day: +m[3], year: +m[4] }); });

    const rowRe = /^(\d{1,2})\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+([\d.]+)$/;
    const tables = [];
    let curr = null;
    lines.forEach((l) => {
      const m = l.match(rowRe);
      if (!m) return;
      const hr = +m[1];
      if (hr < 1 || hr > 24) return;
      if (hr === 1 && curr && curr.length) { tables.push(curr); curr = []; }
      if (!curr) curr = [];
      curr.push({ hr, parker: +m[2], crit: +m[3], gate: +m[4], gen: +m[5] });
    });
    if (curr && curr.length) tables.push(curr);

    const downstream = [];
    let critSum = 0, critN = 0;
    const n = Math.min(tables.length, dates.length);
    for (let i = 0; i < n; i++) {
      const d = dates[i];
      tables[i].forEach((r) => {
        const t = mstEpoch(d.month, d.day, d.year, r.hr - 1);
        if (t == null) return;
        downstream.push({ t, v: r.parker - r.crit });
        critSum += r.crit; critN++;
      });
    }
    downstream.sort((a, b) => a.t - b.t);
    if (!downstream.length) throw new Error("No rows parsed");

    return { statusCode: 200, headers, body: JSON.stringify({
      source: SOURCE,
      note: "Downstream flow = Parker inflow minus the CRIT canal diversion (avg ~" + (critN ? Math.round(critSum / critN) : 0) + " cfs pulled out at Headgate).",
      downstream,
    }) };
  } catch (err) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: String(err && err.message ? err.message : err), downstream: [] }) };
  }
};
