// src/utils/textChunker.ts

export interface ChunkOptions {
  chunkSize?: number;
  chunkOverlap?: number;
}

/**
 * Splits a clean text string into smaller overlapping chunks.
 * Ensures chunks do not break in the middle of words.
 */
export function chunkText(
  text: string,
  options: ChunkOptions = {}
): string[] {
  const chunkSize = options.chunkSize ?? 500;
  const overlap = options.chunkOverlap ?? 50;
  console.log('Got chunk configs')
  if (chunkSize <= 0) throw new Error('chunkSize must be greater than 0');
  if (overlap >= chunkSize) throw new Error('overlap must be less than chunkSize');

  const chunks: string[] = [];
  let startIndex = 0;

  while (startIndex < text.length) {
    // 1. Get the raw chunk boundary
    let endIndex = startIndex + chunkSize;

    // 2. If it exceeds text length, we are at the end
    if (endIndex >= text.length) {
      chunks.push(text.substring(startIndex).trim());
      break;
    }

    // 3. To avoid splitting a word, backtrack to the nearest space
    const lastSpace = text.lastIndexOf(' ', endIndex);
    if (lastSpace > startIndex) {
      endIndex = lastSpace;
    }

    // 4. Extract the chunk
    const chunk = text.substring(startIndex, endIndex).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }

    // 5. Slide the window forward (subtracting overlap)
    startIndex = endIndex - overlap;

    // Guard against infinite loop if overlap is somehow negative or zero forward progress
    if (startIndex >= endIndex) {
      startIndex = endIndex;
    }
  }

  return chunks;
}
