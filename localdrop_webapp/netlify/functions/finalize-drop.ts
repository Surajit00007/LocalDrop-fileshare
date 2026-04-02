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
  const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID || '';
  const token = process.env.NETLIFY_AUTH_TOKEN || process.env.TOKEN || '';
  if (siteID && token) {
    return getStore({ name, consistency: 'strong', siteID, token });
  }
  return getStore({ name, consistency: 'strong' });
}

export const handler: Handler = async (event) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: cors, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { dropId, filename, size, mimeType, totalChunks } = body;

    if (!dropId || !filename || !size || !mimeType || totalChunks === undefined) {
      return {
        statusCode: 400,
        headers: cors,
        body: JSON.stringify({ error: 'Missing required fields' }),
      };
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
      expiresAt: now + 60 * 60 * 1000,
      downloadCount: 0,
    };

    const store = getStoreWithAuth('drops-metadata');
    await store.setJSON(dropId, metadata);

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({ ok: true, dropId, correctCode }),
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[finalize-drop] Error:', message);
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ error: message }),
    };
  }
};
