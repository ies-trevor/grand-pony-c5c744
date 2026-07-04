// Runs in GitHub Actions (Node 20). Fetches Reclamation's hourly reach feed and the
// Headgate Rock Dam schedule PDF server-side (no CORS), parses both, and writes
// data/riverdata.json for the dashboard to read. Exits 0 if at least one source worked.

const fs = require("fs");

const BOR = "https://www.usbr.gov/lc/region/g4000/riverops/webreports/hourlyweb.json";
const HG = "https://www.usbr.gov/lc/region/g4000/hourly/HeadgateReport.pdf";
const MONTHS = { january:0, february:1, march:2, april:3, may:4, june:5, july:6, august:7, september:8, october:9, november:10, december:11 };

// "7/3/2026 6:00:00 PM" (MST, UTC-7 year round) -> epoch ms
function borToEpoch(s) {
  const m = String(s).match(/(\d+)\/(\d+)\/(\d+)\s+(\d+):(\d+):(\d+)\s+(AM|PM)/i);
  if (!m) return null;
  let mo = +m[1], d = +m[2], y = +m[3], h = +m[4], mi = +m[5];
  const ap = m[7].toUpperCase();
  if (ap === "PM" && h < 12) h += 12;
  if (ap === "AM" && h === 12) h = 0;
  return Date.UTC(y, mo - 1, d, h, mi, 0) + 7 * 3600 * 1000;
}
function mstEpoch(mn, day, year, hour) {
  const mo = MONTHS[String(mn).toLowerCase()];
  if (mo == null) return null;
  return Date.UTC(year, mo, day, hour, 0, 0) + 7 * 3600 * 1000;
}
function findSeries(series, names, typePart) {
  return series.find((s) => {
    const n = (s.SiteName || "").toLowerCase();
    return names.some((x) => n.includes(x)) && (s.DataTypeName || "").toLowerCase().includes(typePart);
  });
}
function toPoints(s) {
  if (!s || !Array.isArray(s.Data)) return [];
  return s.Data.map((d) => ({ t: borToEpoch(d.t), v: d.v === "" ? null : parseFloat(d.v) }))
    .filter((p) => p.t && p.v != null && !isNaN(p.v))
    .sort((a, b) => a.t - b.t);
}

// Must match the station shape the page expects
const REACH = [
  { key: "parker",     name: "Parker Dam release", role: "Release upstream \u00b7 early warning", order: 0, names: ["havasu", "parker"], releaseType: "release" },
  { key: "waterwheel", name: "Water Wheel", role: "Reference sensor \u00b7 this stretch", order: 1, primary: true, names: ["water wheel"] },
  { key: "i10",        name: "Blythe (I-10 bridge)", role: "Reclamation sensor \u00b7 at Blythe", order: 2, names: ["i-10", "interstate 10", "i10"] },
  { key: "taylor",     name: "Taylor Ferry", role: "Reclamation sensor \u00b7 below Blythe", order: 4, names: ["taylor"] },
];

function buildStations(json) {
  const series = json.Series || [];
  const stations = [];
  for (const def of REACH) {
    let flow, stage = [];
    if (def.releaseType) {
      flow = toPoints(findSeries(series, def.names, def.releaseType) || findSeries(series, def.names, "flow"));
    } else {
      flow = toPoints(findSeries(series, def.names, "flow"));
      stage = toPoints(findSeries(series, def.names, "gage height"));
    }
    if (flow.length || stage.length) {
      stations.push({ key: def.key, name: def.name, role: def.role, order: def.order, primary: !!def.primary, source: "USBR", flow, stage });
    }
  }
  return stations;
}

function parseHeadgate(text) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const dates = [];
  const dateRe = /(sunday|monday|tuesday|wednesday|thursday|friday|saturday),\s+([a-z]+)\s+(\d{1,2}),\s+(\d{4})/gi;
  let dm;
  while ((dm = dateRe.exec(text))) dates.push({ month: dm[2], day: +dm[3], year: +dm[4] });

  const rowRe = /^(\d{1,2})\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+([\d.]+)$/;
  let tables = [], curr = null;
  for (const l of lines) {
    const m = l.match(rowRe);
    if (!m) continue;
    const hr = +m[1];
    if (hr < 1 || hr > 24) continue;
    if (hr === 1 && curr && curr.length) { tables.push(curr); curr = []; }
    if (!curr) curr = [];
    curr.push({ hr, parker: +m[2], crit: +m[3] });
  }
  if (curr && curr.length) tables.push(curr);

  // Fallback: global scan in case the extractor didn't keep one row per line
  if (!tables.length) {
    const g = /(\d{1,2})\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+\.\d+)/g;
    let mm, c2 = null;
    while ((mm = g.exec(text))) {
      const hr = +mm[1];
      if (hr < 1 || hr > 24) continue;
      if (hr === 1 && c2 && c2.length) { tables.push(c2); c2 = []; }
      if (!c2) c2 = [];
      c2.push({ hr, parker: +mm[2], crit: +mm[3] });
    }
    if (c2 && c2.length) tables.push(c2);
  }

  const downstream = [];
  let critSum = 0, critN = 0;
  const n = Math.min(tables.length, dates.length);
  for (let i = 0; i < n; i++) {
    const d = dates[i];
    for (const r of tables[i]) {
      const t = mstEpoch(d.month, d.day, d.year, r.hr - 1);
      if (t == null) continue;
      downstream.push({ t, v: r.parker - r.crit });
      critSum += r.crit; critN++;
    }
  }
  downstream.sort((a, b) => a.t - b.t);
  return {
    downstream,
    note: downstream.length ? "Downstream flow = Parker inflow minus the CRIT canal diversion (avg ~" + Math.round(critSum / critN) + " cfs pulled out at Headgate)." : "",
  };
}

async function main() {
  const out = { generatedAt: new Date().toISOString(), stations: [], headgate: null, errors: [] };

  try {
    const r = await fetch(BOR, { headers: { "User-Agent": "blythe-river-bot" } });
    if (!r.ok) throw new Error("HTTP " + r.status);
    out.stations = buildStations(await r.json());
    if (!out.stations.length) out.errors.push("reach: feed loaded but no known sites matched");
  } catch (e) {
    out.errors.push("reach: " + (e && e.message ? e.message : e));
  }

  try {
    const pdf = require("pdf-parse/lib/pdf-parse.js");
    const r = await fetch(HG, { headers: { "User-Agent": "blythe-river-bot" } });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const buf = Buffer.from(await r.arrayBuffer());
    const parsed = parseHeadgate((await pdf(buf)).text);
    out.headgate = parsed.downstream.length ? parsed : null;
    if (!parsed.downstream.length) out.errors.push("headgate: parsed 0 rows (layout change?)");
  } catch (e) {
    out.errors.push("headgate: " + (e && e.message ? e.message : e));
  }

  fs.mkdirSync("data", { recursive: true });
  fs.writeFileSync("data/riverdata.json", JSON.stringify(out));
  console.log(
    "stations:", out.stations.map((s) => s.key + ":" + s.flow.length + "f/" + s.stage.length + "s").join(", ") || "none",
    "| headgate pts:", out.headgate ? out.headgate.downstream.length : 0,
    "| errors:", out.errors.join(" ; ") || "none"
  );
  if (!out.stations.length && !out.headgate) process.exit(1);
}

if (require.main === module) main();
module.exports = { parseHeadgate, buildStations };
