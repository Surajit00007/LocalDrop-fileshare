import { getStore } from '@netlify/blobs';

export default async (req: Request) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { chunkData, dropId, chunkIndex } = body;

    if (!chunkData || dropId === undefined || chunkIndex === undefined) {
      return new Response(JSON.stringify({ error: 'Missing required chunk parameters' }), { status: 400, headers: corsHeaders });
    }

    // V2 Context automatically links Netlify Blobs!
    const store = getStore('drops-data');
    const blobKey = `${dropId}/${chunkIndex}`;
    
    // Store array buffer directly
    const uint8 = Buffer.from(chunkData, 'base64');
    await store.set(blobKey, uint8.buffer.slice(uint8.byteOffset, uint8.byteOffset + uint8.byteLength));

    return new Response(JSON.stringify({ ok: true, blobKey }), { status: 200, headers: corsHeaders });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[upload-chunk] Error:', message);
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: corsHeaders });
  }
};

