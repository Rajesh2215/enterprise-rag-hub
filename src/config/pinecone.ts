import { Pinecone, type Index } from '@pinecone-database/pinecone';
import { env } from './env.js';

// ─── Singleton client ────────────────────────────────────────────────────────
let _client: Pinecone | null = null;

export function getPineconeClient(): Pinecone {
  if (!env.PINECONE_API_KEY) {
    throw new Error('PINECONE_API_KEY is not set in environment variables');
  }

  if (!_client) {
    _client = new Pinecone({ apiKey: env.PINECONE_API_KEY });
  }

  return _client;
}

// ─── Lazy index handle ───────────────────────────────────────────────────────
let _index: Index | null = null;

export function getPineconeIndex(): Index {
  if (!_index) {
    _index = getPineconeClient().index(env.PINECONE_INDEX_NAME);
  }
  return _index;
}

// ─── Index initialisation (called once at startup) ───────────────────────────
/**
 * Ensures the Pinecone serverless index exists.
 * - Dimension 1536  → matches OpenAI text-embedding-3-small / ada-002
 * - Metric   cosine → standard for semantic search
 * Creates the index if it does not exist yet; no-ops if it already does.
 */
export async function initialisePineconeIndex(
  dimension: number = 1536,
  metric: 'cosine' | 'euclidean' | 'dotproduct' = 'cosine'
): Promise<void> {
  const client = getPineconeClient();
  const indexName = env.PINECONE_INDEX_NAME;

  // List existing indexes
  const { indexes = [] } = await client.listIndexes();
  const exists = indexes.some((idx) => idx.name === indexName);

  if (exists) {
    console.log(`✅ Pinecone index "${indexName}" already exists`);
    return;
  }

  console.log(`🔧 Creating Pinecone serverless index "${indexName}" (dim=${dimension}, metric=${metric}) …`);

  await client.createIndex({
    name: indexName,
    dimension,
    metric,
    spec: {
      serverless: {
        cloud: env.PINECONE_CLOUD as 'aws' | 'gcp' | 'azure',
        region: env.PINECONE_REGION,
      },
    },
  });

  console.log(`✅ Pinecone index "${indexName}" created successfully`);
}
