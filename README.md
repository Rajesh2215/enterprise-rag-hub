# Enterprise RAG Hub

> A production-grade, full-stack **Retrieval-Augmented Generation (RAG)** platform featuring a Node.js/Express backend engine and a modern React web interface.

---

## 🌟 Key Features

* **Hybrid Search (Dense + Sparse)**: Combines **Pinecone** vector embeddings (Google `gemini-embedding-001` with Matryoshka 768d truncation) and in-memory **Okapi BM25** keyword retrieval, fused via **Reciprocal Rank Fusion (RRF)**.
* **Parent-Child Chunking & Auto-Merging**: Decouples high-precision search (300-character child chunks) from rich generation context (1,500-character parent paragraphs).
* **Two-Stage Retrieval & Cohere Reranking**: Filters candidates with Bi-Encoder recall, followed by full cross-attention reranking using **Cohere `rerank-english-v3.0`**.
* **Corrective RAG (CRAG)**: Confidence score thresholding:
  * **$S \ge 0.50$ (High Confidence)**: Direct generation.
  * **$0.20 \le S < 0.50$ (Ambiguous)**: Automatic query expansion into 3 variations to widen recall.
  * **$S < 0.20$ (Out of Scope)**: Immediate safe fallback, bypassing the LLM to eliminate hallucinations and reduce token costs.
* **Semantic Intent Router**: 2-tier classification (0ms in-memory cache + Gemini zero-temperature classifier) routing greetings and chitchat into a fast path ($<100\text{ms}$), bypassing vector lookups.
* **Real-Time Token Streaming**: Unidirectional **Server-Sent Events (SSE)** streaming using an `AsyncGenerator` pipeline architecture for sub-200ms Time-to-First-Token (TTFT).
* **Conversational Memory & Query Rewriting**: Redis-backed sliding-window memory (10 messages, 24h TTL) with zero-temperature query de-contextualization.
* **Automated Evaluation (LLM-as-a-Judge)**: Automated endpoint scoring responses against the **RAG Triad** (Faithfulness, Answer Relevance, and Context Relevance).

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                              OFFLINE INGESTION PIPELINE                                     │
│                                                                                             │
│  Raw PDF ──► PDF Extraction ──► NFKC Cleaning ──► Parent-Child ──┬──► Gemini MRL (768d) ──► Pinecone
│                                 & Frequency Filter  (1500c/300c) │    Embeddings            Namespace
│                                                                  └──► MongoDB Parent & Child Chunks
└─────────────────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                           ONLINE HYBRID QUERY & CHAT PIPELINE                               │
│                                                                                             │
│  User Query + SessionId                                                                     │
│      │                                                                                      │
│      ▼                                                                                      │
│  Redis Memory ──► Sliding Window Buffer (Last 10 messages)                                  │
│      │                                                                                      │
│      ▼                                                                                      │
│  Query Rewriter ──► Resolves pronouns into standalone search query                          │
│      │                                                                                      │
│      ▼                                                                                      │
│  🚦 INTENT ROUTER:                                                                           │
│      ├─► [CHITCHAT] ────────► ⚡ Fast-Path Direct Response (< 100ms)                        │
│      ▼                                                                                      │
│  [KNOWLEDGE_QUERY]                                                                          │
│      │                                                                                      │
│      ├──► Dense Vector Search (Pinecone ANN - Top 15)                                       │
│      ├──► Sparse Lexical Search (Okapi BM25 - Top 15)                                       │
│      │                                                                                      │
│      ▼                                                                                      │
│  Reciprocal Rank Fusion (RRF, k=60) ──► Cohere Cross-Encoder Reranker (Top 5)               │
│      │                                                                                      │
│      ▼                                                                                      │
│  🛡️ CORRECTIVE RAG (CRAG) CHECK:                                                            │
│      ├─► Score < 0.20 ────────► Safe Fallback (Bypass LLM)                                  │
│      ├─► 0.20 <= Score < 0.50 ─► Multi-Query Expansion (3 variants)                          │
│      └─► Score >= 0.50 ───────► High Confidence                                             │
│                                      │                                                      │
│                                      ▼                                                      │
│  Auto-Merging Expansion ──► Fetch & Deduplicate 1500c Parent Paragraphs from MongoDB         │
│      │                                                                                      │
│      ▼                                                                                      │
│  Grounded Generation (Gemini) ──► Server-Sent Events (SSE) Stream (< 200ms TTFT)            │
│      │                                                                                      │
│      └──► LLM-as-a-Judge Evaluation (Faithfulness, Relevance, Context)                      │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

* **Backend**: Node.js, TypeScript, Express.js, MongoDB (Mongoose), Redis (ioredis)
* **Frontend**: React 18, Vite, TypeScript, Tailwind CSS, Redux Toolkit, Axios, Lucide Icons
* **Vector Database**: Pinecone (Serverless)
* **LLM & Embeddings**: Google Gemini (`gemini-3.1-flash-lite`, `gemini-embedding-001` with MRL 768d)
* **Reranking**: Cohere Cross-Encoder (`rerank-english-v3.0`)
* **Validation & Security**: Zod, JWT (Access + Refresh Token), bcryptjs

---

## 🖥️ Full-Stack Web Application

The platform includes a modern, responsive React web interface:

* **Real-Time Streaming Chat**: Typewriter token streaming via SSE with inline source citation cards and confidence badges.
* **Knowledge Base Management**: Drag-and-drop PDF uploader with live processing state tracking and document deletion.
* **Chatbot Studio**: Create, edit, and configure custom chatbot personas with tailored system prompts.
* **Interactive RAG Quality Evaluation**: In-app evaluation modal scoring any response against the RAG Triad with visual progress rings.
* **Multi-Session History**: Session management with sidebar previews and fast switching.
* **Dark / Light Mode**: Sleek dark theme by default with seamless light theme toggle.


---

## 🚀 Getting Started

### Prerequisites

Ensure you have the following installed:
* [Node.js](https://nodejs.org/) (v18 or higher)
* [MongoDB](https://www.mongodb.com/) (running locally or a MongoDB Atlas URI)
* [Redis](https://redis.io/) (running on `localhost:6379` or Redis Cloud)
* API Keys for:
  * [Google AI Studio](https://aistudio.google.com/) (Gemini)
  * [Pinecone](https://www.pinecone.io/)
  * [Cohere](https://cohere.com/)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-username/Enterprise-Knowledge-Hub.git
   cd Enterprise-Knowledge-Hub
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   ```bash
   cp .env.example .env
   ```
   *Open `.env` and fill in your API keys (Gemini, Pinecone, Cohere) and database connection URIs.*


4. **Run the development server:**
   ```bash
   npm run dev
   ```

5. **Build for production:**
   ```bash
   npm run build
   npm start
   ```

---

## 📡 API Reference

All protected endpoints require an `Authorization: Bearer <token>` header.

### Authentication
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/signup` | Register a new user |
| `POST` | `/api/auth/signin` | Login & receive tokens |
| `POST` | `/api/auth/refresh` | Refresh access token |
| `POST` | `/api/auth/signout` | Invalidate session |
| `GET` | `/api/auth/me` | Fetch authenticated user profile |

### Chatbots
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/chatbots` | Create a new chatbot persona |
| `GET` | `/api/chatbots` | List all chatbots for user |
| `GET` | `/api/chatbots/:id` | Get chatbot details |
| `PATCH` | `/api/chatbots/:id` | Update chatbot name / system prompt |
| `DELETE` | `/api/chatbots/:id` | Delete chatbot & clean up indices |

### Document Knowledge Base
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/chatbots/:id/documents` | Upload PDF (parses, chunks, embeds & indexes) |
| `GET` | `/api/chatbots/:id/documents` | List uploaded documents |
| `DELETE` | `/api/chatbots/:id/documents/:docId` | Delete document & vector embeddings |

### Chat & Streaming
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/chatbots/:id/chat` | Non-streaming standard RAG completion |
| `POST` | `/api/chatbots/:id/chat/stream` | Real-time SSE token stream |
| `GET` | `/api/chatbots/:id/chat/sessions/:sessionId/history` | Retrieve session message history |
| `DELETE` | `/api/chatbots/:id/chat/sessions/:sessionId` | Clear session memory |

### Evaluation
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/chatbots/:id/eval` | Benchmark query against the RAG Triad |

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
