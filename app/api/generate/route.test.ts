import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/claude", () => ({
  streamGeneration: vi.fn(async function* () {
    yield "Hello ";
    yield "PRD";
  }),
}));

import { POST } from "./route";

function makeReq(body: unknown) {
  return new Request("http://localhost/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/generate", () => {
  it("returns 400 when description is missing", async () => {
    const res = await POST(makeReq({ history: [] }));
    expect(res.status).toBe(400);
  });

  it("streams the generated text for valid input", async () => {
    const res = await POST(makeReq({ description: "做个 todo 应用" }));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("Hello");
    expect(text).toContain("PRD");
  });
});
