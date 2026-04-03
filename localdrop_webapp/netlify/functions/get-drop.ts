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

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default async (req: Request) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const dropId = url.searchParams.get('dropId');
  
  if (!dropId) {
    return new Response(JSON.stringify({ error: 'Missing dropId' }), { status: 400, headers: corsHeaders });
  }

  try {
    const store = getStore('drops-metadata');
    const metadata = await store.get(dropId, { type: 'json' }) as DropMetadata | null;

    if (!metadata) {
      return new Response(JSON.stringify({ error: 'Drop not found' }), { status: 404, headers: corsHeaders });
    }

    if (Date.now() > metadata.expiresAt) {
      return new Response(JSON.stringify({ error: 'This drop has expired' }), { status: 410, headers: corsHeaders });
    }

    // Build 4 options (1 correct + 3 decoys) — never expose correct code to client
    const decoys = new Set<number>();
    decoys.add(metadata.correctCode);
    while (decoys.size < 4) {
      decoys.add(Math.floor(Math.random() * 100));
    }
    const options = shuffleArray(Array.from(decoys));

    return new Response(JSON.stringify({
      filename: metadata.filename,
      size: metadata.size,
      mimeType: metadata.mimeType,
      totalChunks: metadata.totalChunks,
      options,
      expiresAt: metadata.expiresAt,
    }), { status: 200, headers: corsHeaders });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[get-drop] Error:', message);
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: corsHeaders });
  }
};

