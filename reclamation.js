// Reclamation Lower Colorado hourly reach feed (server-side, no CORS).
// Uses Node's built-in https (works on any Node version; no global fetch, no deps).

const https = require("https");
const SOURCE = "https://www.usbr.gov/lc/region/g4000/riverops/webreports/hourlyweb.json";

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

function borToEpoch(s) {
  const m = String(s).match(/(\d+)\/(\d+)\/(\d+)\s+(\d+):(\d+):(\d+)\s+(AM|PM)/i);
  if (!m) return null;
  let mo = +m[1], d = +m[2], y = +m[3], h = +m[4], mi = +m[5];
  const ap = m[7].toUpperCase();
  if (ap === "PM" && h < 12) h += 12;
  if (ap === "AM" && h === 12) h = 0;
  return Date.UTC(y, mo - 1, d, h, mi, 0) + 7 * 3600 * 1000;
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

const REACH = [
  { key: "parker",     display: "Parker Dam release", role: "Release upstream \u00b7 early warning", order: 0, names: ["havasu", "parker"], releaseType: "release" },
  { key: "waterwheel", display: "Your reach (Water Wheel)", role: "Reclamation sensor \u00b7 ~2 mi from house", order: 1, primary: true, names: ["water wheel"] },
  { key: "i10",        display: "Blythe (I-10 bridge)", role: "Reclamation sensor \u00b7 at Blythe", order: 2, names: ["i-10", "interstate 10", "i10"] },
  { key: "taylor",     display: "Taylor Ferry", role: "Reclamation sensor \u00b7 below Blythe", order: 4, names: ["taylor"] },
];

exports.handler = async () => {
  const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=600" };
  try {
    const buf = await fetchBuffer(SOURCE);
    const json = JSON.parse(buf.toString("utf8"));
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
        stations.push({ key: def.key, name: def.display, role: def.role, order: def.order, primary: !!def.primary, source: "USBR", flow, stage });
      }
    }
    return { statusCode: 200, headers, body: JSON.stringify({ queryDate: json.QueryDate || null, source: SOURCE, stations }) };
  } catch (err) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: String(err && err.message ? err.message : err), stations: [] }) };
  }
};
