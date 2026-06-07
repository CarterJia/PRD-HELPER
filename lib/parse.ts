import type { ParsedGeneration, PrdMeta } from "./types";

export const META_START = "<<<PRD_META>>>";
export const META_END = "<<<END_PRD_META>>>";

const EMPTY: PrdMeta = { assumptions: [], questions: [] };

/** Split a full (possibly streamed-complete) generation into document + meta. */
export function parseGeneration(raw: string): ParsedGeneration {
  const start = raw.indexOf(META_START);
  if (start === -1) {
    return { document: raw.trim(), meta: { ...EMPTY } };
  }
  const document = raw.slice(0, start).trim();
  const end = raw.indexOf(META_END, start);
  const json = raw.slice(start + META_START.length, end === -1 ? undefined : end);
  return { document, meta: safeMeta(json) };
}

/** During streaming, show only the document part (hide the partial trailer). */
export function stripMetaForDisplay(raw: string): string {
  const start = raw.indexOf(META_START);
  return start === -1 ? raw : raw.slice(0, start);
}

function safeMeta(json: string): PrdMeta {
  try {
    const obj = JSON.parse(json.trim()) as Record<string, unknown>;
    return {
      assumptions: toStringArray(obj.assumptions),
      questions: toStringArray(obj.questions),
    };
  } catch {
    return { ...EMPTY };
  }
}

function toStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}
