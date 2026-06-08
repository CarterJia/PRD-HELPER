# Inline Edit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user drag-select a passage in the PRD canvas, type an instruction, and regenerate only that block-range in place (streamed) — instead of refreshing the whole document.

**Architecture:** A pure `splitBlocks()` parses the model document (`state.document`) into blank-line-delimited blocks with exact source offsets — no dependency on react-markdown internals, fully unit-testable. PrdDocument renders the app-owned metadata header (non-editable) plus the body as per-block `<div data-block-index>` wrappers. CanvasPanel maps a DOM selection to the covered blocks' `[start,end)` offsets, shows an instruction popover, and calls a new `/api/edit` streaming endpoint; the reply replaces that span via `spliceDocument()`. Version bumps like a regen.

**Tech Stack:** Next.js 15 + React 19, TypeScript, Tailwind, `@anthropic-ai/sdk`, react-markdown, Vitest.

> **Design note (deviation from spec §4):** The spec listed react-markdown source offsets as primary and manual block-splitting as fallback. This plan promotes manual `splitBlocks()` to primary because it is pure/unit-testable and removes the spec §12 risk. Outcome (drag-select-to-block inline edit) is identical.

---

## File Structure

```
lib/edit.ts            NEW  splitBlocks · spliceDocument · stripCodeFence (pure)
lib/edit.test.ts       NEW
lib/types.ts           MOD  + EditRequest
lib/prompt.ts          MOD  + buildEditSystemPrompt · buildEditMessages
lib/prompt.test.ts     MOD  + edit-prompt tests
lib/claude.ts          MOD  + streamEdit (real + mock)
lib/claude.test.ts     MOD  + streamEdit mock test
app/api/edit/route.ts  NEW  streaming edit endpoint
app/api/edit/route.test.ts NEW
hooks/useGeneration.ts MOD  + editSpan
components/InlineEditPopover.tsx NEW
components/PrdDocument.tsx   MOD (rewrite: metadata-separate + per-block body + highlight)
components/CanvasPanel.tsx   MOD (rewrite: selection → popover → onEdit)
app/page.tsx           MOD  pass editSpan as onEdit
```

---

## Task 1: `lib/edit.ts` — pure block/splice/fence helpers (TDD)

**Files:**
- Create: `lib/edit.ts`
- Test: `lib/edit.test.ts`
- Modify: `lib/types.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { splitBlocks, spliceDocument, stripCodeFence } from "./edit";

describe("splitBlocks", () => {
  it("splits on blank lines and reports exact source offsets", () => {
    const doc = "## A\n\npara one\nline two\n\n- x\n- y";
    const blocks = splitBlocks(doc);
    expect(blocks.map((b) => b.text)).toEqual(["## A", "para one\nline two", "- x\n- y"]);
    // offsets must slice back to the same text
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd "/Users/uw/Desktop/prd helper" && npx vitest run lib/edit.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
export interface Block {
  start: number; // offset into the source document (inclusive)
  end: number;   // offset into the source document (exclusive)
  text: string;  // document.slice(start, end)
}

/** Split a markdown document into blank-line-delimited blocks with source offsets. */
export function splitBlocks(document: string): Block[] {
  const blocks: Block[] = [];
  let offset = 0;
  let cur: { start: number; end: number } | null = null;

  for (const line of document.split("\n")) {
    const lineStart = offset;
    const lineEnd = offset + line.length;
    if (line.trim() === "") {
      if (cur) {
        blocks.push({ ...cur, text: document.slice(cur.start, cur.end) });
        cur = null;
      }
    } else if (cur) {
      cur.end = lineEnd;
    } else {
      cur = { start: lineStart, end: lineEnd };
    }
    offset = lineEnd + 1; // +1 for the consumed "\n"
  }
  if (cur) blocks.push({ ...cur, text: document.slice(cur.start, cur.end) });
  return blocks;
}

/** Replace document[start,end) with replacement. */
export function spliceDocument(
  document: string,
  start: number,
  end: number,
  replacement: string,
): string {
  return document.slice(0, start) + replacement + document.slice(end);
}

/** If the string is wrapped in a ```fence```, return the inner content. */
export function stripCodeFence(s: string): string {
  const m = s.trim().match(/^```[^\n]*\n([\s\S]*?)\n?```$/);
  return m ? m[1] : s;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd "/Users/uw/Desktop/prd helper" && npx vitest run lib/edit.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Add `EditRequest` to `lib/types.ts`**

Append to `lib/types.ts`:

```ts
/** Request body for POST /api/edit. */
export interface EditRequest {
  document: string;     // the model document body (state.document)
  start: number;        // source offset of the span to replace
  end: number;          // source offset (exclusive)
  instruction: string;  // how to rewrite the span
}
```

- [ ] **Step 6: Typecheck + commit**

```bash
cd "/Users/uw/Desktop/prd helper" && npm run typecheck && \
git add lib/edit.ts lib/edit.test.ts lib/types.ts && \
git commit -m "feat: add edit primitives (splitBlocks, spliceDocument, stripCodeFence, EditRequest)"
```

---

## Task 2: `lib/prompt.ts` — edit prompt builders (TDD)

**Files:**
- Modify: `lib/prompt.ts`
- Modify (test): `lib/prompt.test.ts`

- [ ] **Step 1: Add the failing tests**

Append to `lib/prompt.test.ts`:

```ts
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd "/Users/uw/Desktop/prd helper" && npx vitest run lib/prompt.test.ts`
Expected: FAIL — `buildEditSystemPrompt` / `buildEditMessages` not exported.

- [ ] **Step 3: Implement — append to `lib/prompt.ts`**

```ts
const EDIT_SYSTEM_PROMPT = `你在编辑一份产品需求文档(PRD)的某一段。下面会给你完整 PRD 作为上下文。

要求:
- **只重写**给定的「待修改片段」以满足用户指令。
- 保持与该片段相同的 Markdown 结构与标题层级,并与全文风格一致。
- **只输出**替换后的 Markdown 片段本身,不要复述其他部分,不要解释,不要代码围栏。
- 若指令涉及假设,沿用 \`> 💡 假设:……\` 的写法;不要编造客观事实(人名/数字)。`;

export function buildEditSystemPrompt(): string {
  return EDIT_SYSTEM_PROMPT;
}

export function buildEditMessages(req: {
  document: string;
  excerpt: string;
  instruction: string;
}): ChatMessage[] {
  const content = `完整 PRD(仅作上下文,不要整体重写):\n\n${req.document}\n\n---\n待修改片段:\n\n${req.excerpt}\n\n---\n修改指令:${req.instruction}`;
  return [{ role: "user", content }];
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd "/Users/uw/Desktop/prd helper" && npx vitest run lib/prompt.test.ts`
Expected: PASS (all prompt tests, including the 2 new ones).

- [ ] **Step 5: Commit**

```bash
cd "/Users/uw/Desktop/prd helper" && \
git add lib/prompt.ts lib/prompt.test.ts && \
git commit -m "feat: add edit system prompt and message builder"
```

---

## Task 3: `lib/claude.ts` — `streamEdit` (real + mock)

**Files:**
- Modify: `lib/claude.ts`
- Modify (test): `lib/claude.test.ts`

- [ ] **Step 1: Add the failing test**

Append to `lib/claude.test.ts`:

```ts
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd "/Users/uw/Desktop/prd helper" && npx vitest run lib/claude.test.ts`
Expected: FAIL — `streamEdit` not exported.

- [ ] **Step 3: Implement — append to `lib/claude.ts`**

First, update the import line at the top of `lib/claude.ts`:

```ts
import { buildSystemPrompt, buildMessages, buildEditSystemPrompt, buildEditMessages } from "./prompt";
import type { GenerateRequest, EditRequest } from "./types";
```

Then append:

```ts
/** Stream a rewrite of document[start,end) per an instruction. Mock-aware. */
export async function* streamEdit(req: EditRequest): AsyncGenerator<string> {
  const excerpt = req.document.slice(req.start, req.end);

  if (isMockMode()) {
    yield* streamMockEdit(excerpt, req.instruction);
    return;
  }

  const client = new Anthropic();
  const stream = client.messages.stream({
    model: process.env.ANTHROPIC_MODEL || DEFAULT_MODEL,
    max_tokens: 2000,
    system: buildEditSystemPrompt(),
    messages: buildEditMessages({ document: req.document, excerpt, instruction: req.instruction }),
  });

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      yield event.delta.text;
    }
  }
}

async function* streamMockEdit(excerpt: string, instruction: string): AsyncGenerator<string> {
  const out = `${excerpt}(已按「${instruction}」调整 · 演示模式)`;
  const chunks = out.match(/[\s\S]{1,24}/g) ?? [out];
  for (const c of chunks) {
    await new Promise((r) => setTimeout(r, 10));
    yield c;
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd "/Users/uw/Desktop/prd helper" && npx vitest run lib/claude.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd "/Users/uw/Desktop/prd helper" && \
git add lib/claude.ts lib/claude.test.ts && \
git commit -m "feat: add streamEdit with demo fallback"
```

---

## Task 4: `app/api/edit/route.ts` — streaming edit endpoint

**Files:**
- Create: `app/api/edit/route.ts`
- Test: `app/api/edit/route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd "/Users/uw/Desktop/prd helper" && npx vitest run app/api/edit/route.test.ts`
Expected: FAIL — `./route` not found.

- [ ] **Step 3: Write the implementation**

```ts
import { streamEdit } from "@/lib/claude";
import type { EditRequest } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  let body: Partial<EditRequest>;
  try {
    body = (await req.json()) as Partial<EditRequest>;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { document, start, end, instruction } = body;
  if (
    typeof document !== "string" ||
    typeof start !== "number" ||
    typeof end !== "number" ||
    typeof instruction !== "string" ||
    !instruction.trim()
  ) {
    return new Response("document, start, end, instruction are required", { status: 400 });
  }
  if (start < 0 || end > document.length || start >= end) {
    return new Response("invalid range", { status: 400 });
  }

  const request: EditRequest = { document, start, end, instruction };
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of streamEdit(request)) {
          controller.enqueue(encoder.encode(chunk));
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "编辑失败";
        controller.enqueue(encoder.encode(`\n[编辑出错:${msg}]`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" },
  });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd "/Users/uw/Desktop/prd helper" && npx vitest run app/api/edit/route.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Full suite + typecheck**

Run: `cd "/Users/uw/Desktop/prd helper" && npm test && npm run typecheck`
Expected: all tests PASS, typecheck clean.

- [ ] **Step 6: Commit**

```bash
cd "/Users/uw/Desktop/prd helper" && \
git add app/api/edit/route.ts app/api/edit/route.test.ts && \
git commit -m "feat: add streaming /api/edit route"
```

---

## Task 5: `hooks/useGeneration.ts` — `editSpan`

**Files:**
- Modify: `hooks/useGeneration.ts`

- [ ] **Step 1: Add the `stripCodeFence` import**

At the top of `hooks/useGeneration.ts`, update the parse import to also import from edit:

```ts
import { parseGeneration, stripMetaForDisplay } from "@/lib/parse";
import { stripCodeFence } from "@/lib/edit";
```

- [ ] **Step 2: Add the `editSpan` callback**

Insert this **immediately before** the `return { state, generate, refine };` line:

```ts
  const editSpan = useCallback(
    async (args: { document: string; start: number; end: number; instruction: string }) => {
      const { document, start, end, instruction } = args;
      const before = document.slice(0, start);
      const after = document.slice(end);

      setState((s) => ({ ...s, isStreaming: true, error: null }));

      try {
        const res = await fetch("/api/edit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ document, start, end, instruction }),
        });
        if (!res.ok || !res.body) throw new Error(`服务返回 ${res.status}`);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let acc = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += decoder.decode(value, { stream: true });
          setState((s) => ({ ...s, document: before + acc + after }));
        }

        regenRef.current += 1;
        setState((s) => ({
          ...s,
          document: before + stripCodeFence(acc) + after,
          version: `V0.${regenRef.current}`,
          modifiedAt: nowStamp(),
          isStreaming: false,
          messages: [
            ...s.messages,
            { role: "assistant", content: `✏️ 已按「${instruction}」修改选中段落` },
          ],
        }));
      } catch (err) {
        const msg = err instanceof Error ? err.message : "编辑失败";
        setState((s) => ({
          ...s,
          document, // roll back to pre-edit document
          isStreaming: false,
          error: msg,
          messages: [...s.messages, { role: "assistant", content: `⚠️ 编辑出错:${msg}。已还原。` }],
        }));
      }
    },
    [],
  );
```

- [ ] **Step 3: Export `editSpan`**

Change the return line to:

```ts
  return { state, generate, refine, editSpan };
```

- [ ] **Step 4: Typecheck + commit**

```bash
cd "/Users/uw/Desktop/prd helper" && npm run typecheck && \
git add hooks/useGeneration.ts && \
git commit -m "feat: add editSpan action to useGeneration"
```

---

## Task 6: `components/InlineEditPopover.tsx`

**Files:**
- Create: `components/InlineEditPopover.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useState } from "react";

interface Props {
  x: number;
  y: number;
  onSubmit: (instruction: string) => void;
  onCancel: () => void;
}

export function InlineEditPopover({ x, y, onSubmit, onCancel }: Props) {
  const [value, setValue] = useState("");

  const submit = () => {
    const t = value.trim();
    if (t) onSubmit(t);
  };

  return (
    <div
      style={{ position: "fixed", left: x, top: y, zIndex: 50 }}
      className="w-72 rounded-lg border border-slate-300 bg-white p-2 shadow-lg"
    >
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          } else if (e.key === "Escape") {
            onCancel();
          }
        }}
        placeholder="如何修改这段?如:更偏 B2B、加一个 P0…"
        className="w-full rounded border border-slate-300 px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none"
      />
      <div className="mt-1 flex justify-end gap-2 text-xs">
        <button onClick={onCancel} className="px-2 py-1 text-slate-500 hover:text-slate-700">
          取消
        </button>
        <button
          onClick={submit}
          className="rounded bg-indigo-600 px-2 py-1 font-medium text-white hover:bg-indigo-700"
        >
          修改 ➤
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
cd "/Users/uw/Desktop/prd helper" && npm run typecheck && \
git add components/InlineEditPopover.tsx && \
git commit -m "feat: add inline edit popover"
```

---

## Task 7: `components/PrdDocument.tsx` — render metadata separately + per-block body

**Files:**
- Modify (rewrite): `components/PrdDocument.tsx`

- [ ] **Step 1: Replace the file contents**

```tsx
"use client";

import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { buildMetadataMarkdown, type DocMeta } from "@/lib/markdown";
import type { Block } from "@/lib/edit";

interface Props {
  blocks: Block[];
  meta: DocMeta;
  highlightRange: { start: number; end: number } | null;
}

function Callout({ children }: { children?: ReactNode }) {
  return (
    <blockquote className="not-prose my-3 rounded-lg border-l-4 border-amber-400 bg-amber-50 px-4 py-2 text-sm text-amber-900">
      {children}
    </blockquote>
  );
}

export function PrdDocument({ blocks, meta, highlightRange }: Props) {
  return (
    <article className="prose prose-slate max-w-none prose-table:text-sm">
      {/* App-owned metadata header — NOT editable */}
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{buildMetadataMarkdown(meta)}</ReactMarkdown>

      {/* Editable body: one wrapper per source block */}
      <div data-prd-body>
        {blocks.map((b, i) => {
          const highlighted =
            highlightRange && b.start >= highlightRange.start && b.end <= highlightRange.end;
          return (
            <div
              key={b.start}
              data-block-index={i}
              className={highlighted ? "rounded bg-indigo-50 ring-2 ring-indigo-300" : undefined}
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ blockquote: Callout }}>
                {b.text}
              </ReactMarkdown>
            </div>
          );
        })}
      </div>
    </article>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
cd "/Users/uw/Desktop/prd helper" && npm run typecheck && \
git add components/PrdDocument.tsx && \
git commit -m "refactor: render metadata header non-editable + per-block body"
```

---

## Task 8: `components/CanvasPanel.tsx` — selection → popover → edit

**Files:**
- Modify (rewrite): `components/CanvasPanel.tsx`

- [ ] **Step 1: Replace the file contents**

```tsx
"use client";

import { useMemo, useRef, useState } from "react";
import { PrdDocument } from "./PrdDocument";
import { InlineEditPopover } from "./InlineEditPopover";
import { buildExportMarkdown, type DocMeta } from "@/lib/markdown";
import { splitBlocks, type Block } from "@/lib/edit";

interface Props {
  document: string;
  meta: DocMeta;
  isMockMode: boolean;
  isStreaming: boolean;
  started: boolean;
  onEdit: (args: { document: string; start: number; end: number; instruction: string }) => void;
}

interface Pending {
  start: number;
  end: number;
  x: number;
  y: number;
}

function nearestBlock(node: Node | null): HTMLElement | null {
  let el: HTMLElement | null =
    node && node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as HTMLElement | null);
  while (el && el.dataset.blockIndex === undefined) el = el.parentElement;
  return el;
}

function resolveSelection(container: HTMLElement, blocks: Block[]): Pending | null {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!container.contains(range.commonAncestorContainer)) return null;

  const a = nearestBlock(range.startContainer);
  const b = nearestBlock(range.endContainer);
  if (!a || !b) return null;

  const i1 = Number(a.dataset.blockIndex);
  const i2 = Number(b.dataset.blockIndex);
  if (Number.isNaN(i1) || Number.isNaN(i2)) return null;

  const lo = Math.min(i1, i2);
  const hi = Math.max(i1, i2);
  if (!blocks[lo] || !blocks[hi]) return null;

  const rect = range.getBoundingClientRect();
  return { start: blocks[lo].start, end: blocks[hi].end, x: rect.left, y: rect.bottom + 6 };
}

export function CanvasPanel({ document, meta, isMockMode, isStreaming, started, onEdit }: Props) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const blocks = useMemo(() => splitBlocks(document), [document]);
  const hasDoc = document.trim().length > 0;

  const onMouseUp = () => {
    if (isStreaming || !bodyRef.current) return;
    const p = resolveSelection(bodyRef.current, blocks);
    if (p) setPending(p);
  };

  const submitEdit = (instruction: string) => {
    if (!pending) return;
    onEdit({ document, start: pending.start, end: pending.end, instruction });
    setPending(null);
    window.getSelection()?.removeAllRanges();
  };

  const copy = async () => {
    await navigator.clipboard.writeText(buildExportMarkdown(meta, document));
  };

  const download = () => {
    const blob = new Blob([buildExportMarkdown(meta, document)], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement("a");
    a.href = url;
    a.download = `PRD-${meta.version}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-800">📄 PRD Helper</span>
          {started && (
            <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
              {meta.version} · {meta.status}
            </span>
          )}
          {isMockMode && started && (
            <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
              演示模式
            </span>
          )}
          {started && hasDoc && (
            <span className="text-xs text-slate-400">划选正文 → 输入指令即可局部修改</span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={copy}
            disabled={!hasDoc}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
          >
            📋 复制 Markdown
          </button>
          <button
            onClick={download}
            disabled={!hasDoc}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
          >
            ⬇️ 下载 .md
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto bg-white px-8 py-6" ref={bodyRef} onMouseUp={onMouseUp}>
        {!started ? (
          <div className="flex h-full items-center justify-center text-center text-slate-400">
            <p>左侧描述你的产品想法,PRD 会在这里逐字生成。</p>
          </div>
        ) : (
          <>
            <PrdDocument blocks={blocks} meta={meta} highlightRange={pending} />
            {isStreaming && (
              <span className="ml-0.5 inline-block h-4 w-2 animate-pulse bg-slate-400 align-middle" />
            )}
          </>
        )}
      </div>

      {pending && !isStreaming && (
        <InlineEditPopover
          x={pending.x}
          y={pending.y}
          onSubmit={submitEdit}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
cd "/Users/uw/Desktop/prd helper" && npm run typecheck && \
git add components/CanvasPanel.tsx && \
git commit -m "feat: drag-select to inline-edit in CanvasPanel"
```

---

## Task 9: Wire `editSpan` into `app/page.tsx` + end-to-end verify

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Destructure and pass `editSpan`**

In `app/page.tsx`, change the hook destructure line:

```tsx
  const { state, generate, refine, editSpan } = useGeneration();
```

and add the `onEdit` prop to `<CanvasPanel>` (place it after the `started` prop):

```tsx
        onEdit={editSpan}
```

- [ ] **Step 2: Full typecheck + tests + build**

Run: `cd "/Users/uw/Desktop/prd helper" && npm run typecheck && npm test && npm run build`
Expected: typecheck clean; all tests PASS; build succeeds.

- [ ] **Step 3: Manual E2E verification (dev server)**

Run `npm run dev` (if not running), open `http://localhost:3000`, then:
1. Generate a PRD (Demo or real).
2. Drag-select across one paragraph in the canvas → a popover appears below the selection; the covered block is highlighted.
3. Type an instruction (e.g., "更简洁一点") + Enter → only that block streams a rewrite in place; the rest of the doc is unchanged.
4. Version bumps (e.g., V0.1 → V0.2); 最后修改时间 updates; chat shows "✏️ 已按「…」修改选中段落".
5. Select across two adjacent paragraphs → both are covered as one range and rewritten together.
6. Select inside the 文档信息 metadata table → no popover appears (non-editable).
7. Copy/Download still export the full current document.

- [ ] **Step 4: Commit**

```bash
cd "/Users/uw/Desktop/prd helper" && \
git add app/page.tsx && \
git commit -m "feat: wire editSpan into the page"
```

---

## Post-Implementation

- Update `README.md` 主要特性 with a line: "✍️ 局部 inline 编辑:划选任意段落 + 指令,只重写该段"。
- Update `docs/product-writeup.md` "再给一周" — move inline-edit out of the future list (now done) or note it as shipped.
- Re-record the demo to include the inline-edit flow.

---

## Self-Review Notes (author checklist — completed)

- **Spec coverage:** §2 decisions (inline, drag-snap-to-block) → Tasks 7/8; §3 UX flow → Tasks 6/8/9; §4 block-offset location → Task 1 `splitBlocks` (manual approach promoted to primary; risk removed); §5 files → all tasks; §6 data flow (before/after live splice) → Task 5 `editSpan`; §7 edit prompt → Task 2; §8 version+chat → Task 5; §9 edge cases (metadata non-editable → Task 7/8 `nearestBlock`; streaming-disabled → Task 8 `onMouseUp` guard; empty instruction → Task 6 `submit`; code fence → Task 1 `stripCodeFence` + Task 5; error rollback → Task 5 catch) ; §10 tests → Tasks 1/2/3/4.
- **Placeholder scan:** none — every step has complete code/commands.
- **Type consistency:** `Block {start,end,text}` (Task 1) used by Tasks 7/8; `EditRequest` (Task 1) used by Tasks 3/4; `streamEdit` (Task 3) used by Task 4; `buildEditSystemPrompt`/`buildEditMessages` (Task 2) used by Task 3; `editSpan({document,start,end,instruction})` (Task 5) === `onEdit` prop (Task 8) === passed in Task 9; `stripCodeFence` (Task 1) used by Tasks 3/5; `highlightRange` shape `{start,end}` consistent Tasks 7/8 (Pending has extra x/y but is assignable to `{start,end}` structurally — PrdDocument reads only start/end).
```
