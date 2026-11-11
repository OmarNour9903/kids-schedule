// قراءة مكان من لينك Google Maps أو من إحداثيات مكتوبة.
// بيرجع { lat, lng, url } لو لقى إحداثيات،
// أو { lat: null, lng: null, url, short: true } للينك المختصر (maps.app.goo.gl)
// لأن المتصفح مايقدرش يفتح اللينك المختصر ويعرف الإحداثيات اللي جواه،
// أو null لو النص مش لينك خرايط ولا إحداثيات.

const COORDS = /(-?\d{1,2}\.\d+)\s*[, ]\s*(-?\d{1,3}\.\d+)/;

const PATTERNS = [
  /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/,              // لينك مكان: ...!3d30.04!4d31.23
  /@(-?\d+\.\d+),(-?\d+\.\d+)/,                  // .../@30.04,31.23,17z
  /[?&](?:q|query|ll|destination|daddr|center)=(-?\d+\.\d+)(?:,|%2C)\s*(-?\d+\.\d+)/i
];

function valid(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

function result(lat, lng, url) {
  const la = Number(lat);
  const ln = Number(lng);
  return valid(la, ln) ? { lat: Number(la.toFixed(6)), lng: Number(ln.toFixed(6)), url } : null;
}

export function parseLocation(text) {
  const input = String(text || "").trim();
  if (!input) return null;

  const urlMatch = input.match(/https?:\/\/\S+/);
  if (urlMatch) {
    const url = urlMatch[0];
    let decoded = url;
    try { decoded = decodeURIComponent(url); } catch (e) { /* نستخدم اللينك زي ما هو */ }

    for (const pattern of PATTERNS) {
      const m = decoded.match(pattern);
      if (m) return result(m[1], m[2], url);
    }
    if (/^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/kgs)\//i.test(url)) {
      return { lat: null, lng: null, url, short: true };
    }
    if (/google\.[a-z.]+\/maps|maps\.google\./i.test(url)) {
      const m = decoded.match(COORDS);
      return m ? result(m[1], m[2], url) : { lat: null, lng: null, url, short: true };
    }
    return null;
  }

  const m = input.match(COORDS);
  return m ? result(m[1], m[2], null) : null;
}
