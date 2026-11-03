// Small helpers shared by the API routes (Cloudflare Pages Functions).

export function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export function missingKey(name, what) {
  return json(501, {
    error: 'missing_key',
    key: name,
    message: `Add ${name} in Cloudflare (your Worker → Settings → Variables and Secrets) to turn on ${what}.`,
  });
}

export async function readJson(request) {
  try { return await request.json(); } catch { return null; }
}

export async function fetchJson(url, options = {}, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, { ...options, signal: controller.signal });
    const text = await r.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
    if (!r.ok) {
      const err = new Error(`Upstream ${r.status}`);
      err.status = r.status;
      err.data = data;
      throw err;
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}
