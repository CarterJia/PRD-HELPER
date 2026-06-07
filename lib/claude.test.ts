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
