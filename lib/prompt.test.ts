import { describe, it, expect } from "vitest";
import { buildSystemPrompt, buildMessages } from "./prompt";

describe("buildSystemPrompt", () => {
  it("defines the PRD structure, priorities, assumption rule and trailer contract", () => {
    const p = buildSystemPrompt();
    expect(p).toContain("## 1. TL;DR");
    expect(p).toContain("## 5. 非目标");
    expect(p).toContain("## 8. 待澄清问题");
    expect(p).toContain("[P0]");
    expect(p).toContain("💡 假设");
    expect(p).toContain("[待填写]");
    expect(p).toContain("<<<PRD_META>>>");
    expect(p).toContain("<<<END_PRD_META>>>");
  });
});

describe("buildMessages", () => {
  it("returns a single user message containing the description when no history", () => {
    const msgs = buildMessages({ description: "做个记账工具", history: [] });
    expect(msgs).toHaveLength(1);
    expect(msgs[0].role).toBe("user");
    expect(msgs[0].content).toContain("做个记账工具");
  });

  it("folds refinement history into the single user message", () => {
    const msgs = buildMessages({
      description: "做个记账工具",
      history: [{ role: "user", content: "用户是大学生宿舍" }],
    });
    expect(msgs).toHaveLength(1);
    expect(msgs[0].content).toContain("做个记账工具");
    expect(msgs[0].content).toContain("用户是大学生宿舍");
  });
});

import { buildEditSystemPrompt, buildEditMessages } from "./prompt";

describe("buildEditSystemPrompt", () => {
  it("instructs to rewrite ONLY the excerpt and output only markdown", () => {
    const p = buildEditSystemPrompt();
    expect(p).toContain("只重写");
    expect(p).toContain("只输出");
    expect(p).toContain("不要代码围栏");
  });
});

describe("buildEditMessages", () => {
  it("includes the full document, the excerpt, and the instruction", () => {
    const msgs = buildEditMessages({
      document: "## 1. TL;DR\n全文内容",
      excerpt: "全文内容",
      instruction: "更偏 B2B",
    });
    expect(msgs).toHaveLength(1);
    expect(msgs[0].role).toBe("user");
    expect(msgs[0].content).toContain("全文内容");
    expect(msgs[0].content).toContain("更偏 B2B");
  });
});
