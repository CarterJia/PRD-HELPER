export type Role = "user" | "assistant";

/** One turn in the refinement conversation (user answers / supplements). */
export interface Turn {
  role: Role;
  content: string;
}

/** Request body for POST /api/generate. */
export interface GenerateRequest {
  description: string; // original natural-language product description
  history: Turn[];     // prior refinement turns; empty on first generation
}

/** Structured trailer the model emits after the markdown document. */
export interface PrdMeta {
  assumptions: string[];
  questions: string[];
}

/** Result of splitting a raw model generation. */
export interface ParsedGeneration {
  document: string; // markdown PRD (everything before the trailer)
  meta: PrdMeta;    // parsed trailer; empty arrays if absent/malformed
}

/** Request body for POST /api/edit. */
export interface EditRequest {
  document: string;     // the model document body (state.document)
  start: number;        // source offset of the span to replace
  end: number;          // source offset (exclusive)
  instruction: string;  // how to rewrite the span
}
