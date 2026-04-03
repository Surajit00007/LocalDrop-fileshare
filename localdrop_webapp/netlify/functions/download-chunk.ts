import { getStore } from '@netlify/blobs';

interface DropMetadata {
  filename: string;
  size: number;
  mimeType: string;
  totalChunks: number;
  correctCode: number;
  createdAt: number;
  expiresAt: number;
  downloadCount: number;
}

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
    const { dropId, selectedCode, chunkIndex } = body;

    if (!dropId || selectedCode === undefined || chunkIndex === undefined) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400, headers: corsHeaders });
    }

    const metaStore = getStore('drops-metadata');
    const metadata = await metaStore.get(dropId, { type: 'json' }) as DropMetadata | null;

    if (!metadata) {
      return new Response(JSON.stringify({ error: 'Drop not found' }), { status: 404, headers: corsHeaders });
    }

    // ===== SECURITY CHECK =====
    if (parseInt(String(selectedCode), 10) !== metadata.correctCode) {
      return new Response(JSON.stringify({ error: 'Wrong code. Access denied.' }), { status: 403, headers: corsHeaders });
    }

    // Verified — fetch single chunk
    const dataStore = getStore('drops-data');
    const blobKey = `${dropId}/${chunkIndex}`;
    const chunkBuffer = await dataStore.get(blobKey, { type: 'arrayBuffer' });

    if (!chunkBuffer) {
      return new Response(JSON.stringify({ error: `Missing chunk ${chunkIndex}` }), { status: 500, headers: corsHeaders });
    }

    // Convert to base64 for JSON response
    const combined = Buffer.from(chunkBuffer);
    const base64 = combined.toString('base64');

    return new Response(JSON.stringify({ data: base64 }), { status: 200, headers: corsHeaders });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[download-chunk] Error:', message);
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: corsHeaders });
  }
};

