import { send } from '../lib/http.js';
import { getShootWeather } from '../lib/weather.js';

// GET /api/weather?place=Bend,%20OR&date=2026-11-21
export default async function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const place = (url.searchParams.get('place') || '').trim();
  const date = (url.searchParams.get('date') || '').trim();
  if (!place) return send(res, 400, { error: 'place_required', message: 'Enter a city for the shoot.' });
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return send(res, 400, { error: 'bad_date', message: 'Use a date like 2026-11-21.' });
  try {
    const w = await getShootWeather(place, date || null);
    if (w.error === 'place_not_found') return send(res, 404, { ...w, message: `Couldn't find "${place}". Try the city and state, like "Bend, OR".` });
    if (w.error) return send(res, 502, { ...w, message: 'Weather is unavailable for that place right now.' });
    return send(res, 200, w);
  } catch (e) {
    return send(res, 502, { error: 'weather_failed', message: 'Weather is unavailable right now.' });
  }
}
