// Weather for the shoot: a real forecast when the date is within 16 days,
// otherwise typical conditions averaged from the last 5 years on that date.
// Uses Open-Meteo (free, no API key).

import { fetchJson } from './http.js';

const FORECAST_DAYS = 16;

const CODES = {
  0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Fog', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
  56: 'Freezing drizzle', 57: 'Freezing drizzle', 61: 'Light rain', 63: 'Rain',
  65: 'Heavy rain', 66: 'Freezing rain', 67: 'Freezing rain', 71: 'Light snow',
  73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains', 80: 'Rain showers',
  81: 'Rain showers', 82: 'Heavy showers', 85: 'Snow showers', 86: 'Snow showers',
  95: 'Thunderstorms', 96: 'Thunderstorms', 99: 'Thunderstorms',
};

export const cToF = (c) => Math.round((c * 9) / 5 + 32);

// "Portland, OR" -> search "Portland", prefer a result whose region/country matches "OR".
export function pickPlace(query, results) {
  if (!results?.length) return null;
  const parts = query.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const hint = parts.slice(1).join(' ');
  if (hint) {
    const match = results.find((r) => {
      const fields = [r.admin1, r.country, r.country_code, stateAbbr(r.admin1)]
        .filter(Boolean).map((s) => s.toLowerCase());
      return fields.some((f) => f === hint || hint.includes(f) || f.includes(hint));
    });
    if (match) return match;
  }
  return results[0];
}

const US_STATES = {
  Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA', Colorado: 'CO',
  Connecticut: 'CT', Delaware: 'DE', Florida: 'FL', Georgia: 'GA', Hawaii: 'HI', Idaho: 'ID',
  Illinois: 'IL', Indiana: 'IN', Iowa: 'IA', Kansas: 'KS', Kentucky: 'KY', Louisiana: 'LA',
  Maine: 'ME', Maryland: 'MD', Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN',
  Mississippi: 'MS', Missouri: 'MO', Montana: 'MT', Nebraska: 'NE', Nevada: 'NV',
  'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
  'North Carolina': 'NC', 'North Dakota': 'ND', Ohio: 'OH', Oklahoma: 'OK', Oregon: 'OR',
  Pennsylvania: 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC', 'South Dakota': 'SD',
  Tennessee: 'TN', Texas: 'TX', Utah: 'UT', Vermont: 'VT', Virginia: 'VA', Washington: 'WA',
  'West Virginia': 'WV', Wisconsin: 'WI', Wyoming: 'WY', 'District of Columbia': 'DC',
};
function stateAbbr(name) { return name ? US_STATES[name] : undefined; }

export function daysBetween(fromIso, toIso) {
  const a = Date.UTC(...fromIso.split('-').map((n, i) => Number(n) - (i === 1 ? 1 : 0)));
  const b = Date.UTC(...toIso.split('-').map((n, i) => Number(n) - (i === 1 ? 1 : 0)));
  return Math.round((b - a) / 86400000);
}

function shiftIso(iso, years, days = 0) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y + years, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function summarizeForecast(daily, i) {
  const hiC = daily.temperature_2m_max[i];
  const loC = daily.temperature_2m_min[i];
  return {
    kind: 'forecast',
    highF: cToF(hiC), lowF: cToF(loC), highC: Math.round(hiC), lowC: Math.round(loC),
    precipChance: daily.precipitation_probability_max?.[i] ?? null,
    condition: CODES[daily.weather_code?.[i]] || null,
    sunset: daily.sunset?.[i]?.slice(11, 16) || null,
  };
}

// histories: array of Open-Meteo archive "daily" blocks, one per past year.
export function summarizeHistory(histories) {
  const highs = []; const lows = []; let wet = 0; let days = 0;
  for (const d of histories) {
    if (!d?.time) continue;
    d.time.forEach((_, i) => {
      const hi = d.temperature_2m_max?.[i]; const lo = d.temperature_2m_min?.[i];
      if (hi == null || lo == null) return;
      highs.push(hi); lows.push(lo); days += 1;
      if ((d.precipitation_sum?.[i] ?? 0) >= 1) wet += 1;
    });
  }
  if (!days) return null;
  const avg = (a) => a.reduce((s, n) => s + n, 0) / a.length;
  const hiC = avg(highs); const loC = avg(lows);
  return {
    kind: 'typical',
    highF: cToF(hiC), lowF: cToF(loC), highC: Math.round(hiC), lowC: Math.round(loC),
    precipChance: Math.round((wet / days) * 100),
    condition: null,
    sunset: null,
  };
}

export async function getShootWeather(placeQuery, dateIso, today = new Date().toISOString().slice(0, 10)) {
  const name = placeQuery.split(',')[0].trim();
  const geo = await fetchJson(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=10&language=en&format=json`,
  );
  const place = pickPlace(placeQuery, geo?.results);
  if (!place) return { error: 'place_not_found' };

  const where = {
    name: place.name, region: place.admin1 || '', country: place.country_code || '',
    lat: place.latitude, lon: place.longitude,
  };
  const date = dateIso || today;
  const ahead = daysBetween(today, date);
  const daily = 'temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code,sunset';

  if (ahead >= 0 && ahead < FORECAST_DAYS) {
    const f = await fetchJson(
      `https://api.open-meteo.com/v1/forecast?latitude=${where.lat}&longitude=${where.lon}&daily=${daily}&timezone=auto&start_date=${date}&end_date=${date}`,
    );
    return { place: where, date, ...summarizeForecast(f.daily, 0) };
  }

  // Too far out (or in the past): average the same week over the last 5 years.
  const years = [1, 2, 3, 4, 5];
  const histories = await Promise.all(years.map((n) => fetchJson(
    `https://archive-api.open-meteo.com/v1/archive?latitude=${where.lat}&longitude=${where.lon}`
    + `&start_date=${shiftIso(date, -n, -3)}&end_date=${shiftIso(date, -n, 3)}`
    + '&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto',
  ).then((r) => r.daily).catch(() => null)));
  const typical = summarizeHistory(histories);
  if (!typical) return { error: 'no_weather' };
  return { place: where, date, ...typical };
}
