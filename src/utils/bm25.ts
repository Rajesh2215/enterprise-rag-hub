// src/utils/bm25.ts

export interface BM25Document {
  id: string;
  text: string;
  documentId: string;
  documentTitle: string;
  chunkIndex: number;
}

export interface SearchCandidate {
  id: string;
  text: string;
  documentId: string;
  documentTitle: string;
  chunkIndex?: number | undefined;
}

// Tokenize text: lowercase, remove punctuation, split into word tokens
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 1);
}

export class BM25Index {
  private documents: BM25Document[] = [];
  private docTokens: string[][] = [];
  private docLengths: number[] = [];
  private avgDocLength: number = 0;
  private df: Map<string, number> = new Map(); // Document Frequency for each word
  private k1: number = 1.5;
  private b: number = 0.75;

  constructor(documents: BM25Document[]) {
    this.documents = documents;
    this.buildIndex();
  }

  private buildIndex() {
    const N = this.documents.length;
    let totalLength = 0;

    this.docTokens = this.documents.map((doc) => {
      const tokens = tokenize(doc.text);
      this.docLengths.push(tokens.length);
      totalLength += tokens.length;

      // Count unique terms in this doc for DF
      const uniqueTerms = new Set(tokens);
      uniqueTerms.forEach((term) => {
        this.df.set(term, (this.df.get(term) || 0) + 1);
      });

      return tokens;
    });

    this.avgDocLength = N > 0 ? totalLength / N : 0;
  }

  // Search using Okapi BM25 scoring formula
  search(query: string, topK: number = 15): BM25Document[] {
    const queryTokens = tokenize(query);
    if (queryTokens.length === 0 || this.documents.length === 0) {
      return [];
    }

    const N = this.documents.length;
    const scores: { doc: BM25Document; score: number }[] = [];

    this.documents.forEach((doc, idx) => {
      const tokens = this.docTokens[idx]!;
      const docLen = this.docLengths[idx]!;

      // Term Frequencies in this doc
      const tfMap = new Map<string, number>();
      tokens.forEach((t) => tfMap.set(t, (tfMap.get(t) || 0) + 1));

      let score = 0;
      queryTokens.forEach((qTerm) => {
        const tf = tfMap.get(qTerm) || 0;
        if (tf === 0) return;

        const docFreq = this.df.get(qTerm) || 0;
        // Standard smoothed IDF
        const idf = Math.log((N - docFreq + 0.5) / (docFreq + 0.5) + 1);

        // BM25 term score
        const numerator = tf * (this.k1 + 1);
        const denominator = tf + this.k1 * (1 - this.b + this.b * (docLen / (this.avgDocLength || 1)));
        score += idf * (numerator / denominator);
      });

      if (score > 0) {
        scores.push({ doc, score });
      }
    });

    // Sort descending by BM25 score
    scores.sort((a, b) => b.score - a.score);
    return scores.slice(0, topK).map((s) => s.doc);
  }
}

/**
 * Reciprocal Rank Fusion (RRF)
 * Merges two ranked lists (Dense and Sparse) into a single deduplicated ranked candidate list.
 */
export function reciprocalRankFusion(
  denseResults: SearchCandidate[],
  sparseResults: SearchCandidate[],
  k: number = 60
): SearchCandidate[] {
  const rrfScores = new Map<string, { candidate: SearchCandidate; score: number }>();

  // 1. Score dense candidates: 1 / (k + rank)
  denseResults.forEach((doc, rank) => {
    const key = `${doc.documentId}_${doc.chunkIndex ?? 0}`;
    const current = rrfScores.get(key) || { candidate: doc, score: 0 };
    current.score += 1 / (k + (rank + 1));
    rrfScores.set(key, current);
  });

  // 2. Score sparse candidates: 1 / (k + rank)
  sparseResults.forEach((doc, rank) => {
    const key = `${doc.documentId}_${doc.chunkIndex ?? 0}`;
    const current = rrfScores.get(key) || { candidate: doc, score: 0 };
    current.score += 1 / (k + (rank + 1));
    rrfScores.set(key, current);
  });

  // 3. Sort by highest combined RRF score
  return Array.from(rrfScores.values())
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.candidate);
}
