import { chunkText } from './textChunker.js';

export interface ChildChunk {
  childId: string;
  parentId: string;
  childIndex: number;
  text: string;
}

export interface ParentChunk {
  parentId: string;
  parentIndex: number;
  text: string;
  children: ChildChunk[];
}

export interface HierarchyResult {
  parents: ParentChunk[];
  allChildren: ChildChunk[];
}

/**
 * Splits document text into large Parent chunks (1500 chars)
 * and small Child chunks (300 chars) linked to their parent.
 */
export function chunkParentChild(
  text: string,
  parentSize: number = 1500,
  parentOverlap: number = 150,
  childSize: number = 300,
  childOverlap: number = 50
): HierarchyResult {
  // 1. Generate Parent chunks
  const parentTexts = chunkText(text, {
    chunkSize: parentSize,
    chunkOverlap: parentOverlap,
  });

  const parents: ParentChunk[] = [];
  const allChildren: ChildChunk[] = [];

  parentTexts.forEach((parentText, parentIdx) => {
    const parentId = `parent_${parentIdx}`;

    // 2. Generate Child chunks inside this parent
    const childTexts = chunkText(parentText, {
      chunkSize: childSize,
      chunkOverlap: childOverlap,
    });

    const children: ChildChunk[] = childTexts.map((childText, childIdx) => {
      const childId = `${parentId}_child_${childIdx}`;
      return {
        childId,
        parentId,
        childIndex: childIdx,
        text: childText,
      };
    });

    parents.push({
      parentId,
      parentIndex: parentIdx,
      text: parentText,
      children,
    });

    allChildren.push(...children);
  });

  return { parents, allChildren };
}

