import type { Handler } from '@netlify/functions';
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

function getStoreWithAuth(name: string) {
  const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
  const token = process.env.NETLIFY_AUTH_TOKEN || process.env.TOKEN;
  if (siteID && token) {
    return getStore({ name, siteID, token, consistency: 'strong' });
  }
  return getStore(name);
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const handler: Handler = async (event) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: cors, body: '' };
  }

  const dropId = event.queryStringParameters?.dropId;
  if (!dropId) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Missing dropId' }) };
  }

  try {
    const store = getStoreWithAuth('drops-metadata');
    const metadata = await store.get(dropId, { type: 'json' }) as DropMetadata | null;

    if (!metadata) {
      return { statusCode: 404, headers: cors, body: JSON.stringify({ error: 'Drop not found' }) };
    }

    if (Date.now() > metadata.expiresAt) {
      return { statusCode: 410, headers: cors, body: JSON.stringify({ error: 'This drop has expired' }) };
    }

    // Build 4 options (1 correct + 3 decoys) — never expose correct code to client
    const decoys = new Set<number>();
    decoys.add(metadata.correctCode);
    while (decoys.size < 4) {
      decoys.add(Math.floor(Math.random() * 100));
    }
    const options = shuffleArray(Array.from(decoys));

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({
        filename: metadata.filename,
        size: metadata.size,
        mimeType: metadata.mimeType,
        totalChunks: metadata.totalChunks, // ADDED
        options,
        expiresAt: metadata.expiresAt,
      }),
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[get-drop] Error:', message);
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: message }) };
  }
};
