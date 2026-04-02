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
  // On deployed Netlify, context is injected automatically
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
    const { chunkData, dropId, chunkIndex } = body;

    if (!chunkData || dropId === undefined || chunkIndex === undefined) {
      return {
        statusCode: 400,
        headers: cors,
        body: JSON.stringify({ error: 'Missing chunkData, dropId, or chunkIndex' }),
      };
    }

    if (typeof chunkData !== 'string' || chunkData.length === 0) {
      return {
        statusCode: 400,
        headers: cors,
        body: JSON.stringify({ error: 'chunkData must be a non-empty base64 string' }),
      };
    }

    const store = getStoreWithAuth('drops-data');
    const blobKey = `${dropId}/${chunkIndex}`;
    // Netlify Blobs expects ArrayBuffer/string/Blob, not Node Buffer
    const uint8 = Buffer.from(chunkData, 'base64');
    await store.set(blobKey, uint8.buffer.slice(uint8.byteOffset, uint8.byteOffset + uint8.byteLength));

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({ ok: true, blobKey }),
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[upload-chunk] Error:', message);
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ error: message }),
    };
  }
};
