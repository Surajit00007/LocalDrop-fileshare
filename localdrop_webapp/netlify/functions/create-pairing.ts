import { getStore } from '@netlify/blobs';
import { randomBytes } from 'node:crypto';

interface DropMetadata { expiresAt: number }

export default async (req: Request) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });

  try {
    const { dropId } = await req.json();
    if (typeof dropId !== 'string' || !/^\d{6}$/.test(dropId)) {
      return new Response(JSON.stringify({ error: 'Invalid drop' }), { status: 400, headers });
    }

    const drops = getStore('drops-metadata');
    const drop = await drops.get(dropId, { type: 'json' }) as DropMetadata | null;
    if (!drop || drop.expiresAt <= Date.now()) {
      return new Response(JSON.stringify({ error: 'Drop not found or expired' }), { status: 404, headers });
    }

    const pairs = getStore('drop-pairings');
    let pairCode = '';
    for (let attempt = 0; attempt < 5; attempt++) {
      pairCode = randomBytes(4).toString('hex').toUpperCase();
      if (!await pairs.get(pairCode, { type: 'json' })) break;
      pairCode = '';
    }
    if (!pairCode) throw new Error('Could not allocate a pairing code');

    await pairs.setJSON(pairCode, { dropId, expiresAt: drop.expiresAt });
    return new Response(JSON.stringify({ pairCode }), { status: 200, headers });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[create-pairing] Error:', message);
    return new Response(JSON.stringify({ error: 'Could not create a pairing code' }), { status: 500, headers });
  }
};
