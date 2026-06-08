export interface Block {
  start: number; // offset into the source document (inclusive)
  end: number;   // offset into the source document (exclusive)
  text: string;  // document.slice(start, end)
}

/** Split a markdown document into blank-line-delimited blocks with source offsets. */
export function splitBlocks(document: string): Block[] {
  const blocks: Block[] = [];
  let offset = 0;
  let cur: { start: number; end: number } | null = null;

  for (const line of document.split("\n")) {
    const lineStart = offset;
    const lineEnd = offset + line.length;
    if (line.trim() === "") {
      if (cur) {
        blocks.push({ ...cur, text: document.slice(cur.start, cur.end) });
        cur = null;
      }
    } else if (cur) {
      cur.end = lineEnd;
    } else {
      cur = { start: lineStart, end: lineEnd };
    }
    offset = lineEnd + 1; // +1 for the consumed "\n"
  }
  if (cur) blocks.push({ ...cur, text: document.slice(cur.start, cur.end) });
  return blocks;
}

/** Replace document[start,end) with replacement. */
export function spliceDocument(
  document: string,
  start: number,
  end: number,
  replacement: string,
): string {
  return document.slice(0, start) + replacement + document.slice(end);
}

/** If the string is wrapped in a ```fence```, return the inner content. */
export function stripCodeFence(s: string): string {
  const m = s.trim().match(/^```[^\n]*\n([\s\S]*?)\n?```$/);
  return m ? m[1] : s;
}
