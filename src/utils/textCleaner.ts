// src/utils/textCleaner.ts

export function cleanExtractedText(raw: string): string {
  let text = raw;

  // 1. Normalize unicode (handles fancy quotes, non-breaking spaces, etc.)
  text = text.normalize('NFKC');

  // 2. Fix hyphenated line breaks (intro-\nduction → introduction)
  text = text.replace(/-\n(\w)/g, '$1');

  // 3. Remove page numbers — common patterns like "Page 1", "1", "- 1 -"
  text = text.replace(/^\s*(page\s+\d+|\d+\s*$|-\s*\d+\s*-)\s*$/gim, '');

  // 4. Remove lines that are ALL CAPS and short (likely headers/footers)
  text = text.replace(/^[A-Z\s]{3,50}$/gm, '');

  // 5. Remove repeated header/footer lines across pages
  text = removeRepeatedLines(text);

  // 6. Collapse multiple spaces into one
  text = text.replace(/[ \t]{2,}/g, ' ');

  // 7. Collapse more than 2 consecutive newlines into exactly 2
  text = text.replace(/\n{3,}/g, '\n\n');

  // 8. Trim leading/trailing whitespace from each line
  text = text
    .split('\n')
    .map((line) => line.trim())
    .join('\n');

  // 9. Final trim
  return text.trim();
}

// Detects lines that repeat 3+ times across the document (headers/footers)
// and removes all occurrences
function removeRepeatedLines(text: string): string {
  const lines = text.split('\n');
  const frequency: Record<string, number> = {};

  for (const line of lines) {
    const key = line.trim();
    if (key.length > 5) {                      // ignore very short lines
      frequency[key] = (frequency[key] ?? 0) + 1;
    }
  }

  // A line repeated 3+ times is likely a header/footer
  const repeated = new Set(
    Object.entries(frequency)
      .filter(([, count]) => count >= 3)
      .map(([line]) => line)
  );

  return lines
    .filter((line) => !repeated.has(line.trim()))
    .join('\n');
}
