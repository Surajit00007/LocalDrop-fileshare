import { getStore } from '@netlify/blobs';

interface Pairing { dropId: string; expiresAt: number }

export default async (req: Request) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'GET') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });

  const code = new URL(req.url).searchParams.get('code')?.toUpperCase() ?? '';
  if (!/^[A-F0-9]{8}$/.test(code)) {
    return new Response(JSON.stringify({ error: 'Enter the 8-character pairing code from the sender' }), { status: 400, headers });
  }

  try {
    const store = getStore('drop-pairings');
    const pairing = await store.get(code, { type: 'json' }) as Pairing | null;
    if (!pairing || pairing.expiresAt <= Date.now()) {
      return new Response(JSON.stringify({ error: 'Pairing code is invalid or has expired' }), { status: 404, headers });
    }

    const metadata = await getStore('drops-metadata').get(pairing.dropId, { type: 'json' }) as { expiresAt: number } | null;
    if (!metadata || metadata.expiresAt <= Date.now()) {
      return new Response(JSON.stringify({ error: 'This drop has expired' }), { status: 410, headers });
    }

    return new Response(JSON.stringify({ dropId: pairing.dropId }), { status: 200, headers });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[resolve-pairing] Error:', message);
    return new Response(JSON.stringify({ error: 'Could not connect to this drop' }), { status: 500, headers });
  }
};
