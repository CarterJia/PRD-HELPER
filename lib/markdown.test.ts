import { describe, it, expect } from "vitest";
import { buildMetadataMarkdown, buildExportMarkdown, type DocMeta } from "./markdown";

const meta: DocMeta = {
  createdAt: "2026-06-07 22:00:00",
  modifiedAt: "2026-06-07 22:05:00",
  version: "V0.2",
  status: "草稿",
};

describe("buildMetadataMarkdown", () => {
  it("includes owner placeholder, version, status and timestamps", () => {
    const md = buildMetadataMarkdown(meta);
    expect(md).toContain("## 0. 文档信息");
    expect(md).toContain("[待填写]");
    expect(md).toContain("V0.2");
    expect(md).toContain("草稿");
    expect(md).toContain("2026-06-07 22:05:00");
  });
});

describe("buildExportMarkdown", () => {
  it("prepends a title and the metadata header to the document body", () => {
    const out = buildExportMarkdown(meta, "## 1. TL;DR\nhi");
    expect(out.startsWith("# 产品需求文档 (PRD)")).toBe(true);
    expect(out).toContain("## 0. 文档信息");
    expect(out).toContain("## 1. TL;DR");
  });
});
