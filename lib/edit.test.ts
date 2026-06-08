import { describe, it, expect } from "vitest";
import { splitBlocks, spliceDocument, stripCodeFence } from "./edit";

describe("splitBlocks", () => {
  it("splits on blank lines and reports exact source offsets", () => {
    const doc = "## A\n\npara one\nline two\n\n- x\n- y";
    const blocks = splitBlocks(doc);
    expect(blocks.map((b) => b.text)).toEqual(["## A", "para one\nline two", "- x\n- y"]);
    for (const b of blocks) expect(doc.slice(b.start, b.end)).toBe(b.text);
  });

  it("handles leading/trailing/multiple blank lines", () => {
    const doc = "\n\n## A\n\n\n\nbody\n\n";
    const blocks = splitBlocks(doc);
    expect(blocks.map((b) => b.text)).toEqual(["## A", "body"]);
    for (const b of blocks) expect(doc.slice(b.start, b.end)).toBe(b.text);
  });

  it("returns [] for empty/whitespace-only input", () => {
    expect(splitBlocks("")).toEqual([]);
    expect(splitBlocks("   \n\n ")).toEqual([]);
  });
});

describe("spliceDocument", () => {
  it("replaces the [start,end) range", () => {
    expect(spliceDocument("hello world", 0, 5, "hi")).toBe("hi world");
    expect(spliceDocument("abc", 3, 3, "d")).toBe("abcd");
  });
});

describe("stripCodeFence", () => {
  it("removes a wrapping code fence", () => {
    expect(stripCodeFence("```md\n## A\nbody\n```")).toBe("## A\nbody");
    expect(stripCodeFence("```\nx\n```")).toBe("x");
  });
  it("returns input unchanged when not fenced", () => {
    expect(stripCodeFence("## A\nbody")).toBe("## A\nbody");
  });
});
