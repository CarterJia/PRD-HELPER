import { describe, it, expect, beforeEach } from "vitest";
import { isMockMode, streamGeneration } from "./claude";
import { SAMPLE_RAW } from "@/mock/sample-prd";

describe("claude mock mode", () => {
  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("isMockMode is true when no API key is set", () => {
    expect(isMockMode()).toBe(true);
  });

  it("streamGeneration yields the full sample in mock mode", async () => {
    let out = "";
    for await (const chunk of streamGeneration({ description: "x", history: [] })) {
      out += chunk;
    }
    expect(out).toBe(SAMPLE_RAW);
  });
});

import { streamEdit } from "./claude";

describe("streamEdit mock mode", () => {
  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("yields a replacement referencing the excerpt and instruction", async () => {
    let out = "";
    for await (const c of streamEdit({
      document: "## 1. TL;DR\n原始片段内容",
      start: 9,
      end: 15,
      instruction: "更口语化",
    })) {
      out += c;
    }
    expect(out).toContain("更口语化");
    expect(out.length).toBeGreaterThan(0);
  });
});
