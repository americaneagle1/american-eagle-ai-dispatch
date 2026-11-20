import { timingSafeEqual } from 'node:crypto';

const json = (status, body) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export default async function handler(request) {
  if (request.method !== 'POST') return json(405, { ok: false });
  const { WHAPI_WEBHOOK_KEY, INGRESS_SECRET, APPS_SCRIPT_URL } = process.env;
  if (!WHAPI_WEBHOOK_KEY || !INGRESS_SECRET || !APPS_SCRIPT_URL) return json(503, { ok: false });
  const key = Buffer.from(new URL(request.url).searchParams.get('key') || '');
  const expected = Buffer.from(WHAPI_WEBHOOK_KEY);
  if (key.length !== expected.length || !timingSafeEqual(key, expected)) return json(403, { ok: false });
  if (Number(request.headers.get('content-length')) > 256000) return json(413, { ok: false });
  let payload;
  try {
    const body = await request.text();
    if (Buffer.byteLength(body) > 256000) return json(413, { ok: false });
    payload = JSON.parse(body);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return json(400, { ok: false });
  } catch {
    return json(400, { ok: false });
  }
  try {
    const reply = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: INGRESS_SECRET, payload }),
      redirect: 'follow',
      signal: AbortSignal.timeout(18000)
    });
    if (!reply.ok) return json(502, { ok: false });
    const result = await reply.json();
    if (result.forbidden) return json(403, { ok: false });
    return result.ok === true ? json(200, { ok: true }) : json(502, { ok: false });
  } catch {
    return json(502, { ok: false });
  }
}
