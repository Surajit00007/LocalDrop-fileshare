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

export const handler: Handler = async (event) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { dropId, selectedCode, chunkIndex } = body;

    if (!dropId || selectedCode === undefined || chunkIndex === undefined) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Missing required fields' }),
      };
    }

    const metaStore = getStoreWithAuth('drops-metadata');
    const metadata = await metaStore.get(dropId, { type: 'json' }) as DropMetadata | null;

    if (!metadata) {
      return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ error: 'Drop not found' }) };
    }

    // ===== SECURITY CHECK =====
    if (parseInt(String(selectedCode), 10) !== metadata.correctCode) {
      return {
        statusCode: 403,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Wrong code. Access denied.' }),
      };
    }

    // Verified — fetch single chunk
    const dataStore = getStoreWithAuth('drops-data');
    const blobKey = `${dropId}/${chunkIndex}`;
    const chunkBuffer = await dataStore.get(blobKey, { type: 'arrayBuffer' });

    if (!chunkBuffer) {
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: `Missing chunk ${chunkIndex}` }),
      };
    }

    // Convert to base64 for JSON response
    const combined = Buffer.from(chunkBuffer);
    const base64 = combined.toString('base64');

    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: base64 }),
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[download-chunk] Error:', message);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: message }),
    };
  }
};
