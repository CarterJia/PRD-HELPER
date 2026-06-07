import { describe, it, expect } from "vitest";
import { parseGeneration, stripMetaForDisplay, META_START, META_END } from "./parse";

const doc = "# PRD\n\n## 1. TL;DR\nA tool.\n";
const trailer = `${META_START}\n{"assumptions":["a1"],"questions":["q1","q2"]}\n${META_END}`;

describe("parseGeneration", () => {
  it("splits document and parses the trailer", () => {
    const res = parseGeneration(`${doc}\n${trailer}`);
    expect(res.document).toBe(doc.trim());
    expect(res.meta.assumptions).toEqual(["a1"]);
    expect(res.meta.questions).toEqual(["q1", "q2"]);
  });

  it("treats the whole string as document when no trailer", () => {
    const res = parseGeneration(doc);
    expect(res.document).toBe(doc.trim());
    expect(res.meta).toEqual({ assumptions: [], questions: [] });
  });

  it("degrades gracefully on malformed trailer JSON", () => {
    const res = parseGeneration(`${doc}\n${META_START}\n{not json}\n${META_END}`);
    expect(res.document).toBe(doc.trim());
    expect(res.meta).toEqual({ assumptions: [], questions: [] });
  });

  it("parses even when the END delimiter is missing (interrupted stream)", () => {
    const res = parseGeneration(`${doc}\n${META_START}\n{"assumptions":[],"questions":["q1"]}`);
    expect(res.meta.questions).toEqual(["q1"]);
  });
});

describe("stripMetaForDisplay", () => {
  it("removes the trailer (and anything after START) for live rendering", () => {
    expect(stripMetaForDisplay(`${doc}${META_START}\n{...`)).toBe(doc);
  });
  it("returns input unchanged when no trailer present", () => {
    expect(stripMetaForDisplay(doc)).toBe(doc);
  });
});
