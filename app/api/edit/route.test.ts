import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/claude", () => ({
  streamEdit: vi.fn(async function* () {
    yield "edited ";
    yield "span";
  }),
}));

import { POST } from "./route";

function makeReq(body: unknown) {
  return new Request("http://localhost/api/edit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/edit", () => {
  it("400 when fields missing", async () => {
    const res = await POST(makeReq({ document: "abc" }));
    expect(res.status).toBe(400);
  });

  it("400 when range is invalid", async () => {
    const res = await POST(makeReq({ document: "abc", start: 2, end: 1, instruction: "x" }));
    expect(res.status).toBe(400);
  });

  it("streams the edited span for valid input", async () => {
    const res = await POST(makeReq({ document: "abcdef", start: 0, end: 3, instruction: "改一下" }));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("edited");
    expect(text).toContain("span");
  });
});
