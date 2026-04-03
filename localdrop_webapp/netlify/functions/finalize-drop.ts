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
    const { dropId, filename, size, mimeType, totalChunks } = body;

    if (!dropId || !filename || !size || !mimeType || totalChunks === undefined) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400, headers: corsHeaders });
    }

    const correctCode = Math.floor(Math.random() * 100);
    const now = Date.now();
    const metadata: DropMetadata = {
      filename,
      size,
      mimeType,
      totalChunks,
      correctCode,
      createdAt: now,
      expiresAt: now + 15 * 60 * 1000,
      downloadCount: 0,
    };

    const store = getStore('drops-metadata');
    await store.setJSON(dropId, metadata);

    return new Response(JSON.stringify({ ok: true, dropId, correctCode }), { status: 200, headers: corsHeaders });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[finalize-drop] Error:', message);
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: corsHeaders });
  }
};

