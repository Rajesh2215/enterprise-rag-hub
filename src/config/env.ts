export const env = {
  PORT: process.env['PORT'] ?? '3000',
  MONGODB_URI: process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017/enterprise-knowledge-hub',
  JWT_SECRET: process.env['JWT_SECRET'] ?? 'dev-secret-change-me',
  JWT_REFRESH_SECRET: process.env['JWT_REFRESH_SECRET'] ?? 'dev-refresh-secret-change-me',
  JWT_EXPIRES_IN: process.env['JWT_EXPIRES_IN'] ?? '15m',
  JWT_REFRESH_EXPIRES_IN: process.env['JWT_REFRESH_EXPIRES_IN'] ?? '7d',

  // Pinecone
  PINECONE_API_KEY: process.env['PINECONE_API_KEY'] ?? '',
  PINECONE_INDEX_NAME: process.env['PINECONE_INDEX_NAME'] ?? 'enterprise-knowledge-hub',
  PINECONE_CLOUD: process.env['PINECONE_CLOUD'] ?? 'aws',
  PINECONE_REGION: process.env['PINECONE_REGION'] ?? 'us-east-1',

  GEMINI_API_KEY: process.env['GEMINI_API_KEY'] ?? '',

  COHERE_API_KEY: process.env['COHERE_API_KEY'] ?? '',
};
