# PRD Helper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a web app where a user describes a product idea in natural language and gets back a structured, honest, iteratively-refinable PRD outline (left chat / right document canvas).

**Architecture:** Next.js (App Router) full-stack. A streaming `/api/generate` route calls the Claude API server-side; the model returns a Markdown PRD followed by a machine-readable `<<<PRD_META>>>` trailer (assumptions + clarifying questions). Pure functions in `lib/` parse the stream; the client renders the document live in a canvas and surfaces questions as clickable chips in a chat panel. No API key ⇒ automatic Demo mode that streams a canned sample.

**Tech Stack:** Next.js 15 + React 19, TypeScript, Tailwind CSS v4 (+ typography plugin), `@anthropic-ai/sdk`, `react-markdown` + `remark-gfm`, Vitest.

---

## File Structure

```
prd-helper/
├── app/
│   ├── layout.tsx               # root layout (created by scaffold; lightly edited)
│   ├── globals.css              # tailwind import + typography plugin
│   ├── page.tsx                 # wires ChatPanel + CanvasPanel via useGeneration
│   └── api/generate/
│       ├── route.ts             # streaming generation endpoint
│       └── route.test.ts        # integration test (mocked claude)
├── components/
│   ├── ChatPanel.tsx            # messages + question chips + input
│   ├── CanvasPanel.tsx          # top bar (version/status/export) + document
│   ├── MessageBubble.tsx        # one chat bubble
│   ├── QuestionChips.tsx        # clickable clarifying questions
│   └── PrdDocument.tsx          # renders metadata header + markdown
├── hooks/
│   └── useGeneration.ts         # client state machine: generate / refine / stream
├── lib/
│   ├── types.ts                 # shared types
│   ├── parse.ts                 # split document vs structured trailer
│   ├── parse.test.ts
│   ├── markdown.ts              # build metadata header + export markdown
│   ├── markdown.test.ts
│   ├── prompt.ts                # system prompt + message builder
│   ├── prompt.test.ts
│   └── claude.ts                # Anthropic client + mock mode + streaming
│       └── claude.test.ts       # (sits at lib/claude.test.ts)
├── mock/
│   └── sample-prd.ts            # canned sample for Demo mode
├── vitest.config.ts
├── .env.local.example
└── README.md
```

---

## Task 1: Scaffold project + tooling

**Files:**
- Create (via scaffold): `package.json`, `tsconfig.json`, `next.config.*`, `postcss.config.*`, `app/layout.tsx`, `app/globals.css`, `app/page.tsx`
- Create: `vitest.config.ts`, `.env.local.example`

- [ ] **Step 1: Scaffold Next.js into a temp dir, then copy in (avoids create-next-app's non-empty-dir conflict with our `docs/`, `.git`, etc.)**

```bash
cd /tmp && rm -rf prd-scaffold
npx --yes create-next-app@15 prd-scaffold \
  --typescript --tailwind --app --no-src-dir --eslint \
  --import-alias "@/*" --use-npm --yes
# copy generated project in, but KEEP our own .git, .gitignore, README, docs
rsync -a \
  --exclude='.git' --exclude='.gitignore' --exclude='README.md' \
  --exclude='node_modules' \
  /tmp/prd-scaffold/ "/Users/uw/Desktop/prd helper/"
```

- [ ] **Step 2: Install runtime + dev dependencies**

```bash
cd "/Users/uw/Desktop/prd helper"
npm install @anthropic-ai/sdk react-markdown remark-gfm @tailwindcss/typography
npm install -D vitest vite-tsconfig-paths
npm install
```

- [ ] **Step 3: Add test scripts to `package.json`**

Run:
```bash
cd "/Users/uw/Desktop/prd helper"
npm pkg set name="prd-helper"
npm pkg set scripts.test="vitest run"
npm pkg set scripts.test:watch="vitest"
npm pkg set scripts.typecheck="tsc --noEmit"
```

- [ ] **Step 4: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "app/**/*.test.ts"],
  },
});
```

- [ ] **Step 5: Enable the Tailwind typography plugin in `app/globals.css`**

Open `app/globals.css`. Immediately below the existing `@import "tailwindcss";` line, add:

```css
@plugin "@tailwindcss/typography";
```

(Leave the rest of the scaffold-generated CSS as-is.)

- [ ] **Step 6: Create `.env.local.example`**

```bash
# Copy to .env.local and fill in. WITHOUT a key, the app runs in Demo mode.
ANTHROPIC_API_KEY=
# Optional — defaults to claude-sonnet-4-6
ANTHROPIC_MODEL=claude-sonnet-4-6
```

- [ ] **Step 7: Verify the project builds and tooling works**

Run:
```bash
cd "/Users/uw/Desktop/prd helper"
npm run typecheck
npm run build
```
Expected: typecheck passes with no errors; `next build` completes successfully (it will build a default home page for now).

- [ ] **Step 8: Commit**

```bash
cd "/Users/uw/Desktop/prd helper"
git add -A
git commit -m "chore: scaffold Next.js + Tailwind + Vitest"
```

---

## Task 2: Shared types

**Files:**
- Create: `lib/types.ts`

- [ ] **Step 1: Create `lib/types.ts`**

```ts
export type Role = "user" | "assistant";

/** One turn in the refinement conversation (user answers / supplements). */
export interface Turn {
  role: Role;
  content: string;
}

/** Request body for POST /api/generate. */
export interface GenerateRequest {
  description: string; // original natural-language product description
  history: Turn[];     // prior refinement turns; empty on first generation
}

/** Structured trailer the model emits after the markdown document. */
export interface PrdMeta {
  assumptions: string[];
  questions: string[];
}

/** Result of splitting a raw model generation. */
export interface ParsedGeneration {
  document: string; // markdown PRD (everything before the trailer)
  meta: PrdMeta;    // parsed trailer; empty arrays if absent/malformed
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `cd "/Users/uw/Desktop/prd helper" && npm run typecheck`
Expected: PASS (no errors).

- [ ] **Step 3: Commit**

```bash
git add lib/types.ts
git commit -m "feat: add shared types"
```

---

## Task 3: `lib/parse.ts` — split document vs structured trailer (TDD)

**Files:**
- Create: `lib/parse.ts`
- Test: `lib/parse.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd "/Users/uw/Desktop/prd helper" && npx vitest run lib/parse.test.ts`
Expected: FAIL — `Cannot find module './parse'` / exports undefined.

- [ ] **Step 3: Write the implementation**

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd "/Users/uw/Desktop/prd helper" && npx vitest run lib/parse.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/parse.ts lib/parse.test.ts
git commit -m "feat: add generation parser with graceful degradation"
```

---

## Task 4: `lib/markdown.ts` — metadata header + export markdown (TDD)

**Files:**
- Create: `lib/markdown.ts`
- Test: `lib/markdown.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd "/Users/uw/Desktop/prd helper" && npx vitest run lib/markdown.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
export interface DocMeta {
  createdAt: string;
  modifiedAt: string;
  version: string;
  status: string;
}

/** App-owned document-info header (§0). People fields stay placeholders. */
export function buildMetadataMarkdown(meta: DocMeta): string {
  return [
    "## 0. 文档信息",
    "",
    "| 字段 | 内容 |",
    "| --- | --- |",
    "| 负责人 / 作者 | [待填写] |",
    "| 评审 / 研发 / 设计 | [待填写] |",
    `| 创建时间 | ${meta.createdAt || "—"} |`,
    `| 最后修改时间 | ${meta.modifiedAt || "—"} |`,
    `| 版本 | ${meta.version} |`,
    `| 状态 | ${meta.status} |`,
  ].join("\n");
}

/** Full markdown for copy/download: title + metadata header + model body. */
export function buildExportMarkdown(meta: DocMeta, document: string): string {
  return `# 产品需求文档 (PRD)\n\n${buildMetadataMarkdown(meta)}\n\n${document.trim()}\n`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd "/Users/uw/Desktop/prd helper" && npx vitest run lib/markdown.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/markdown.ts lib/markdown.test.ts
git commit -m "feat: add metadata header + export markdown builders"
```

---

## Task 5: `lib/prompt.ts` — system prompt + message builder (TDD)

**Files:**
- Create: `lib/prompt.ts`
- Test: `lib/prompt.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd "/Users/uw/Desktop/prd helper" && npx vitest run lib/prompt.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
import type { GenerateRequest } from "./types";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const SYSTEM_PROMPT = `你是一位资深产品经理助手。用户会用自然语言描述一个产品想法,你的任务是产出一份**结构化、诚实、可决策**的 PRD 大纲。

# 输出原则
1. 结构完整:覆盖下列所有核心模块。
2. 对不确定性诚实:区分「事实」与「假设」。凡是你基于推断补充的内容,就近用 \`> 💡 假设:……\` 的引用块标注。
3. 绝不编造客观事实:对无从得知的具体信息(真实人名、确切数字、公司内部数据),不要凭空捏造;放进「待澄清问题」或留 \`[待填写]\`。
4. 决策导向:必须包含「非目标」与功能「优先级」。
5. 信息不足时:不要硬编内容。先给出合理结构骨架,把缺口集中到「待澄清问题」,并在该处多追问。

# 文档结构(严格按此顺序,从「## 1. TL;DR」开始,不要输出文档信息表头)
## 1. TL;DR
一句话:做什么、为谁、解决什么问题。
## 2. 背景与问题
为什么现在做、目标用户的痛点。
## 3. 目标用户与场景
典型用户画像与使用场景。
## 4. 目标与成功指标
可量化的成功标准(KPI)。
## 5. 非目标 (Non-Goals)
本版本明确不做的事(用列表)。
## 6. 功能需求
按功能分条,每条标注优先级 **[P0]/[P1]/[P2]**,并附一句用户故事(作为…我想…以便…)。
## 7. 用户流程
关键路径,用有序列表描述。
## 8. 待澄清问题
3–5 个最关键的、回答后能显著提升 PRD 质量的问题,用列表。

# 按需模块(仅当与产品类型相关时,追加在第 7 节之后)
- ## 非功能需求(性能 / 安全 / 合规)—— 偏 B2B 或技术型产品时
- ## 风险与依赖
- ## 里程碑

# 结尾(必须)
在完整 Markdown 之后另起一行,原样输出下面的机器可读块(不要用代码围栏包裹):
<<<PRD_META>>>
{"assumptions": ["简述每条假设"], "questions": ["与第 8 节相同的澄清问题"]}
<<<END_PRD_META>>>

# 其他
- 用与用户输入相同的语言(默认中文)。
- 直接输出 PRD,不要任何寒暄或前言。`;

export function buildSystemPrompt(): string {
  return SYSTEM_PROMPT;
}

export function buildMessages(req: GenerateRequest): ChatMessage[] {
  let content = `这是用户的产品需求描述:\n\n${req.description.trim()}`;
  if (req.history.length > 0) {
    const qa = req.history
      .map((t) =>
        t.role === "assistant"
          ? `工具上一轮的问题/产出:${t.content}`
          : `用户补充:${t.content}`,
      )
      .join("\n\n");
    content += `\n\n---\n以下是之前几轮的澄清对话,请据此重新生成更准确、更完整的 PRD:\n\n${qa}`;
  }
  return [{ role: "user", content }];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd "/Users/uw/Desktop/prd helper" && npx vitest run lib/prompt.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/prompt.ts lib/prompt.test.ts
git commit -m "feat: add system prompt and message builder"
```

---

## Task 6: `mock/sample-prd.ts` — canned sample for Demo mode

**Files:**
- Create: `mock/sample-prd.ts`

- [ ] **Step 1: Create `mock/sample-prd.ts`**

```ts
export const SAMPLE_DESCRIPTION =
  "我想做一个帮小团队聚餐时 AA 记账、自动算出谁该给谁多少钱的小工具。";

export const SAMPLE_RAW = `## 1. TL;DR
一个面向小团队聚餐场景的轻量 AA 记账工具,记录每笔花销与参与人,自动算出最简转账方案(谁付给谁多少),减少手动对账。

## 2. 背景与问题
小团队聚餐常出现"一人垫付、事后凑钱"的麻烦:谁参加了哪顿、谁还没还,全靠记忆和微信翻账,容易算错、催款尴尬。

> 💡 假设:核心场景是线下聚餐,而非长期合租分摊;单次记账参与人数 ≤ 15。

## 3. 目标用户与场景
- 主要用户:经常组织聚餐的学生 / 年轻同事(组织者)。
- 场景:一顿饭多人多笔花销,部分人只参与部分项目,结束后需要快速结清。

## 4. 目标与成功指标
- 一次完整记账 ≤ 2 分钟。
- 转账笔数较"人人结清"减少 ≥ 50%。
- 次周留存(再次发起记账)≥ 30%。

## 5. 非目标 (Non-Goals)
- 不接入真实支付/转账,只给出应付清单。
- v1 不做多人实时协作编辑。
- 不做长期账本与报表分析。

## 6. 功能需求
- **[P0]** 新建账单:录入每笔花销(金额、付款人、参与人)。作为组织者,我想逐笔录入,以便准确归属费用。
- **[P0]** 最简转账计算:自动算出最少转账方案。作为参与者,我想知道只给谁转一次,以便快速结清。
- **[P1]** 分享结算结果:生成可复制的结算文本。作为组织者,我想一键分享,以便群里通知。
- **[P2]** 历史账单:本地保存最近账单。

> 💡 假设:用户接受数据仅存本地(无账号体系)。

## 7. 用户流程
1. 新建账单 → 2. 逐笔录入花销与参与人 → 3. 查看最简转账方案 → 4. 复制结果分享到群。

## 8. 待澄清问题
- 是否需要支持非均摊(按比例/按项目权重)?
- 是否需要账号与多设备同步,还是本地即可?
- 目标平台是微信小程序、Web 还是 App?

<<<PRD_META>>>
{"assumptions":["核心场景为线下聚餐、参与人数≤15","数据仅存本地、无账号体系","费用默认均摊"],"questions":["是否需要支持非均摊(按比例/权重)?","是否需要多设备同步还是本地即可?","目标平台是小程序、Web 还是 App?"]}
<<<END_PRD_META>>>`;
```

- [ ] **Step 2: Verify it typechecks**

Run: `cd "/Users/uw/Desktop/prd helper" && npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add mock/sample-prd.ts
git commit -m "feat: add canned sample PRD for demo mode"
```

---

## Task 7: `lib/claude.ts` — Anthropic client + mock mode + streaming

**Files:**
- Create: `lib/claude.ts`
- Test: `lib/claude.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd "/Users/uw/Desktop/prd helper" && npx vitest run lib/claude.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt, buildMessages } from "./prompt";
import type { GenerateRequest } from "./types";
import { SAMPLE_RAW } from "@/mock/sample-prd";

const DEFAULT_MODEL = "claude-sonnet-4-6";

export function isMockMode(): boolean {
  return !process.env.ANTHROPIC_API_KEY;
}

/** Stream a generation as text chunks. Falls back to a canned sample with no key. */
export async function* streamGeneration(
  req: GenerateRequest,
): AsyncGenerator<string> {
  if (isMockMode()) {
    yield* streamMock();
    return;
  }

  const client = new Anthropic();
  const stream = client.messages.stream({
    model: process.env.ANTHROPIC_MODEL || DEFAULT_MODEL,
    max_tokens: 8000,
    system: buildSystemPrompt(),
    messages: buildMessages(req),
  });

  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      yield event.delta.text;
    }
  }
}

async function* streamMock(): AsyncGenerator<string> {
  const chunks = SAMPLE_RAW.match(/[\s\S]{1,30}/g) ?? [SAMPLE_RAW];
  for (const c of chunks) {
    await new Promise((r) => setTimeout(r, 10));
    yield c;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd "/Users/uw/Desktop/prd helper" && npx vitest run lib/claude.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/claude.ts lib/claude.test.ts
git commit -m "feat: add claude streaming client with demo fallback"
```

---

## Task 8: `/api/generate` streaming route

**Files:**
- Create: `app/api/generate/route.ts`
- Test: `app/api/generate/route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd "/Users/uw/Desktop/prd helper" && npx vitest run app/api/generate/route.test.ts`
Expected: FAIL — `./route` not found.

- [ ] **Step 3: Write the implementation**

```ts
import { streamGeneration } from "@/lib/claude";
import type { GenerateRequest, Turn } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  let body: Partial<GenerateRequest>;
  try {
    body = (await req.json()) as Partial<GenerateRequest>;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  if (!body.description || typeof body.description !== "string" || !body.description.trim()) {
    return new Response("description is required", { status: 400 });
  }

  const request: GenerateRequest = {
    description: body.description,
    history: Array.isArray(body.history) ? (body.history as Turn[]) : [],
  };

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of streamGeneration(request)) {
          controller.enqueue(encoder.encode(chunk));
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "生成失败";
        controller.enqueue(encoder.encode(`\n\n[生成出错:${msg}]`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Mock-Mode": String(!process.env.ANTHROPIC_API_KEY),
    },
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd "/Users/uw/Desktop/prd helper" && npx vitest run app/api/generate/route.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Run the full test suite + typecheck**

Run: `cd "/Users/uw/Desktop/prd helper" && npm test && npm run typecheck`
Expected: all tests PASS, typecheck clean.

- [ ] **Step 6: Manually verify end-to-end streaming in Demo mode**

Run (in one terminal): `cd "/Users/uw/Desktop/prd helper" && npm run dev`
Then in another terminal:
```bash
curl -N -s -X POST http://localhost:3000/api/generate \
  -H 'Content-Type: application/json' \
  -d '{"description":"做个记账工具","history":[]}'
```
Expected: the sample PRD streams to stdout and ends with the `<<<PRD_META>>>` block. Stop the dev server (Ctrl-C) after verifying.

- [ ] **Step 7: Commit**

```bash
git add app/api/generate/route.ts app/api/generate/route.test.ts
git commit -m "feat: add streaming /api/generate route"
```

---

## Task 9: `hooks/useGeneration.ts` — client state machine

**Files:**
- Create: `hooks/useGeneration.ts`

- [ ] **Step 1: Create the hook**

```ts
"use client";

import { useCallback, useRef, useState } from "react";
import { parseGeneration, stripMetaForDisplay } from "@/lib/parse";
import type { Turn } from "@/lib/types";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface GenerationState {
  document: string;
  assumptions: string[];
  questions: string[];
  version: string;
  createdAt: string;
  modifiedAt: string;
  status: string;
  isStreaming: boolean;
  isMockMode: boolean;
  error: string | null;
  messages: ChatMessage[];
  started: boolean;
}

const INITIAL: GenerationState = {
  document: "",
  assumptions: [],
  questions: [],
  version: "V0.1",
  createdAt: "",
  modifiedAt: "",
  status: "草稿",
  isStreaming: false,
  isMockMode: false,
  error: null,
  messages: [],
  started: false,
};

function nowStamp(): string {
  return new Date().toLocaleString("zh-CN", { hour12: false });
}

function assistantSummary(assumptions: string[], questions: string[]): string {
  const parts = ["已生成 PRD 草稿 👉"];
  if (assumptions.length) parts.push(`我做了 ${assumptions.length} 处假设(文档里 💡 标出)。`);
  if (questions.length) parts.push(`回答下面 ${questions.length} 个问题能让它更准:`);
  else parts.push("信息看起来挺全,你也可以直接补充或修改。");
  return parts.join("\n");
}

export function useGeneration() {
  const [state, setState] = useState<GenerationState>(INITIAL);
  const descriptionRef = useRef("");
  const historyRef = useRef<Turn[]>([]);
  const regenRef = useRef(0);

  const run = useCallback(
    async (description: string, history: Turn[], userBubble: string) => {
      const isFirst = regenRef.current === 0;
      setState((s) => ({
        ...s,
        started: true,
        isStreaming: true,
        error: null,
        document: "",
        createdAt: isFirst ? nowStamp() : s.createdAt,
        messages: [...s.messages, { role: "user", content: userBubble }],
      }));

      try {
        const res = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ description, history }),
        });
        if (!res.ok || !res.body) throw new Error(`服务返回 ${res.status}`);

        const mock = res.headers.get("X-Mock-Mode") === "true";
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let raw = "";

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          raw += decoder.decode(value, { stream: true });
          const display = stripMetaForDisplay(raw);
          setState((s) => ({ ...s, document: display, isMockMode: mock }));
        }

        const parsed = parseGeneration(raw);
        regenRef.current += 1;

        setState((s) => ({
          ...s,
          document: parsed.document,
          assumptions: parsed.meta.assumptions,
          questions: parsed.meta.questions,
          version: `V0.${regenRef.current}`,
          modifiedAt: nowStamp(),
          isStreaming: false,
          isMockMode: mock,
          messages: [
            ...s.messages,
            { role: "assistant", content: assistantSummary(parsed.meta.assumptions, parsed.meta.questions) },
          ],
        }));
      } catch (err) {
        const msg = err instanceof Error ? err.message : "生成失败";
        setState((s) => ({
          ...s,
          isStreaming: false,
          error: msg,
          messages: [...s.messages, { role: "assistant", content: `⚠️ 生成出错:${msg}。请重试。` }],
        }));
      }
    },
    [],
  );

  const generate = useCallback(
    (description: string) => {
      descriptionRef.current = description;
      historyRef.current = [];
      regenRef.current = 0;
      void run(description, [], description);
    },
    [run],
  );

  const refine = useCallback(
    (answer: string) => {
      const history = [...historyRef.current, { role: "user" as const, content: answer }];
      historyRef.current = history;
      void run(descriptionRef.current, history, answer);
    },
    [run],
  );

  return { state, generate, refine };
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `cd "/Users/uw/Desktop/prd helper" && npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add hooks/useGeneration.ts
git commit -m "feat: add useGeneration client state machine"
```

---

## Task 10: `components/PrdDocument.tsx` — render metadata + markdown

**Files:**
- Create: `components/PrdDocument.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { buildExportMarkdown, type DocMeta } from "@/lib/markdown";

interface Props {
  document: string;
  meta: DocMeta;
}

function Callout({ children }: { children?: ReactNode }) {
  return (
    <blockquote className="not-prose my-3 rounded-lg border-l-4 border-amber-400 bg-amber-50 px-4 py-2 text-sm text-amber-900">
      {children}
    </blockquote>
  );
}

export function PrdDocument({ document, meta }: Props) {
  const full = buildExportMarkdown(meta, document);
  return (
    <article className="prose prose-slate max-w-none prose-headings:scroll-mt-4 prose-table:text-sm">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ blockquote: Callout }}>
        {full}
      </ReactMarkdown>
    </article>
  );
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `cd "/Users/uw/Desktop/prd helper" && npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add components/PrdDocument.tsx
git commit -m "feat: add PrdDocument renderer with assumption callouts"
```

---

## Task 11: `components/MessageBubble.tsx` + `components/QuestionChips.tsx`

**Files:**
- Create: `components/MessageBubble.tsx`
- Create: `components/QuestionChips.tsx`

- [ ] **Step 1: Create `components/MessageBubble.tsx`**

```tsx
"use client";

interface Props {
  role: "user" | "assistant";
  content: string;
}

export function MessageBubble({ role, content }: Props) {
  const isUser = role === "user";
  return (
    <div
      className={[
        "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-relaxed",
        isUser
          ? "self-end rounded-br-sm bg-indigo-600 text-white"
          : "self-start rounded-bl-sm border border-slate-200 bg-white text-slate-800",
      ].join(" ")}
    >
      {content}
    </div>
  );
}
```

- [ ] **Step 2: Create `components/QuestionChips.tsx`**

```tsx
"use client";

interface Props {
  questions: string[];
  onPick: (question: string) => void;
}

export function QuestionChips({ questions, onPick }: Props) {
  if (questions.length === 0) return null;
  return (
    <div className="self-start w-[90%] rounded-xl border border-indigo-100 bg-indigo-50/60 p-3">
      <p className="mb-2 text-xs font-medium text-indigo-700">
        回答这些问题能让 PRD 更准:
      </p>
      <div className="flex flex-col gap-2">
        {questions.map((q, i) => (
          <button
            key={i}
            onClick={() => onPick(q)}
            className="rounded-lg border border-indigo-200 bg-white px-3 py-2 text-left text-sm text-slate-700 transition hover:border-indigo-400 hover:bg-indigo-50"
          >
            ❓ {q}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify it typechecks**

Run: `cd "/Users/uw/Desktop/prd helper" && npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add components/MessageBubble.tsx components/QuestionChips.tsx
git commit -m "feat: add chat bubble and question chip components"
```

---

## Task 12: `components/ChatPanel.tsx`

**Files:**
- Create: `components/ChatPanel.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useState } from "react";
import { MessageBubble } from "./MessageBubble";
import { QuestionChips } from "./QuestionChips";
import type { ChatMessage } from "@/hooks/useGeneration";

interface Props {
  messages: ChatMessage[];
  questions: string[];
  isStreaming: boolean;
  started: boolean;
  onSubmit: (text: string) => void;
}

const EXAMPLES = [
  "做一个帮小团队聚餐 AA 记账的小工具",
  "一个给独立开发者收集用户反馈的看板",
];

export function ChatPanel({ messages, questions, isStreaming, started, onSubmit }: Props) {
  const [input, setInput] = useState("");

  const submit = () => {
    const t = input.trim();
    if (!t || isStreaming) return;
    onSubmit(t);
    setInput("");
  };

  return (
    <div className="flex h-full flex-col border-r border-slate-200 bg-slate-50">
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {!started && (
          <div className="mt-6 text-sm text-slate-500">
            <p className="mb-3 font-medium text-slate-700">用一句话描述你的产品想法,我来生成结构化 PRD。</p>
            <p className="mb-1 text-xs uppercase tracking-wide text-slate-400">试试这些:</p>
            <div className="flex flex-col gap-2">
              {EXAMPLES.map((e) => (
                <button
                  key={e}
                  onClick={() => setInput(e)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-left hover:border-indigo-300"
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-3">
          {messages.map((m, i) => (
            <MessageBubble key={i} role={m.role} content={m.content} />
          ))}
          {isStreaming && (
            <div className="self-start text-xs text-slate-400">生成中…</div>
          )}
          {!isStreaming && (
            <QuestionChips questions={questions} onPick={(q) => setInput(`关于「${q}」:`)} />
          )}
        </div>
      </div>

      <div className="border-t border-slate-200 bg-white p-3">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={3}
          placeholder={started ? "回答问题或补充需求…(Enter 发送 / Shift+Enter 换行)" : "描述你的产品想法…"}
          className="w-full resize-none rounded-lg border border-slate-300 p-2 text-sm focus:border-indigo-500 focus:outline-none"
        />
        <button
          onClick={submit}
          disabled={isStreaming || !input.trim()}
          className="mt-2 w-full rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {started ? "发送 ➤" : "生成 PRD ➤"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `cd "/Users/uw/Desktop/prd helper" && npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add components/ChatPanel.tsx
git commit -m "feat: add ChatPanel with examples and question chips"
```

---

## Task 13: `components/CanvasPanel.tsx` — top bar + export

**Files:**
- Create: `components/CanvasPanel.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { PrdDocument } from "./PrdDocument";
import { buildExportMarkdown, type DocMeta } from "@/lib/markdown";

interface Props {
  document: string;
  meta: DocMeta;
  isMockMode: boolean;
  isStreaming: boolean;
  started: boolean;
}

export function CanvasPanel({ document, meta, isMockMode, isStreaming, started }: Props) {
  const hasDoc = document.trim().length > 0;

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

      <div className="flex-1 overflow-y-auto bg-white px-8 py-6">
        {!started ? (
          <div className="flex h-full items-center justify-center text-center text-slate-400">
            <p>左侧描述你的产品想法,PRD 会在这里逐字生成。</p>
          </div>
        ) : (
          <>
            <PrdDocument document={document} meta={meta} />
            {isStreaming && <span className="ml-0.5 inline-block h-4 w-2 animate-pulse bg-slate-400 align-middle" />}
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `cd "/Users/uw/Desktop/prd helper" && npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add components/CanvasPanel.tsx
git commit -m "feat: add CanvasPanel with copy/download export"
```

---

## Task 14: Wire `app/page.tsx` + layout, end-to-end verify

**Files:**
- Modify: `app/page.tsx` (replace scaffold content entirely)
- Modify: `app/layout.tsx` (update title/lang)

- [ ] **Step 1: Replace `app/page.tsx`**

```tsx
"use client";

import { ChatPanel } from "@/components/ChatPanel";
import { CanvasPanel } from "@/components/CanvasPanel";
import { useGeneration } from "@/hooks/useGeneration";
import type { DocMeta } from "@/lib/markdown";

export default function Home() {
  const { state, generate, refine } = useGeneration();

  const onSubmit = (text: string) => {
    if (state.started) refine(text);
    else generate(text);
  };

  const meta: DocMeta = {
    createdAt: state.createdAt,
    modifiedAt: state.modifiedAt,
    version: state.version,
    status: state.status,
  };

  return (
    <main className="grid h-screen grid-cols-[minmax(320px,38%)_1fr]">
      <ChatPanel
        messages={state.messages}
        questions={state.questions}
        isStreaming={state.isStreaming}
        started={state.started}
        onSubmit={onSubmit}
      />
      <CanvasPanel
        document={state.document}
        meta={meta}
        isMockMode={state.isMockMode}
        isStreaming={state.isStreaming}
        started={state.started}
      />
    </main>
  );
}
```

- [ ] **Step 2: Update `app/layout.tsx` metadata**

In `app/layout.tsx`, set the `<html lang>` to `"zh-CN"` and replace the exported `metadata` object with:

```tsx
export const metadata = {
  title: "PRD Helper",
  description: "用自然语言生成结构化 PRD 大纲",
};
```

- [ ] **Step 3: Full typecheck + test + build**

Run: `cd "/Users/uw/Desktop/prd helper" && npm run typecheck && npm test && npm run build`
Expected: typecheck clean, all unit/integration tests PASS, production build succeeds.

- [ ] **Step 4: Manual end-to-end verification (Demo mode)**

Run: `cd "/Users/uw/Desktop/prd helper" && npm run dev`, open `http://localhost:3000`. Verify:
1. Left panel shows example prompts; clicking one fills the input.
2. Clicking **生成 PRD** streams the sample PRD into the right canvas word-by-word; an "演示模式" badge appears.
3. Assumptions render as amber callouts; metadata header shows version `V0.1`, status 草稿, owner `[待填写]`.
4. Clarifying questions appear as chips in the chat; clicking one prefixes the input.
5. Typing an answer and pressing Enter triggers a regeneration; version bumps to `V0.2` and 最后修改时间 updates.
6. **复制 Markdown** copies, **下载 .md** downloads `PRD-V0.2.md`.

Stop the dev server after verifying.

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx app/layout.tsx
git commit -m "feat: wire chat + canvas into the main page"
```

---

## Task 15: README, env example polish, product writeup

**Files:**
- Create/Overwrite: `README.md`
- Create: `docs/product-writeup.md`

- [ ] **Step 1: Write `README.md`**

````markdown
# PRD Helper

用自然语言描述产品想法,自动生成一份**结构化、诚实、可迭代**的 PRD 大纲。左侧对话、右侧文档画布,流式生成。

## 运行方式

```bash
npm install
cp .env.local.example .env.local   # 填入 ANTHROPIC_API_KEY(留空则进入 Demo 模式)
npm run dev                        # http://localhost:3000
```

- 有 `ANTHROPIC_API_KEY`:调用 Claude 实时生成。
- 无 key:自动进入 **Demo 模式**,流式播放一份预置示例,零门槛体验。

测试:`npm test` ｜ 类型检查:`npm run typecheck` ｜ 生产构建:`npm run build`

## 设计思路(简述)

- **协作者交互**:先即时出草稿,再用"显式假设 + 澄清问题"逐步精修,而不是一次性硬生成。
- **对不确定性诚实**:推断内容标 `💡 假设`;人名等客观事实未知时留 `[待填写]`,绝不编造。
- **结构即观点**:固定包含「非目标」与功能优先级(P0/P1/P2),按需附加非功能需求/风险/里程碑。
- **架构**:Next.js 全栈;`/api/generate` 服务端流式调用 Claude,返回「Markdown 文档 + `<<<PRD_META>>>` 结构化尾块」,前端实时渲染画布、把假设/问题喂给对话区。

完整设计见 `docs/superpowers/specs/2026-06-07-prd-helper-design.md`。

## 技术栈

Next.js + TypeScript + Tailwind · `@anthropic-ai/sdk` · react-markdown · Vitest
````

- [ ] **Step 2: Draft `docs/product-writeup.md` (the ≤500-字 deliverable)**

```markdown
# 产品说明(≤500 字)

**怎么定义"一份好的 PRD 大纲"?**
五条:① 结构完整(覆盖背景/用户/目标/需求/边界);② 对不确定性诚实——区分事实与假设,绝不编造人名数字;③ 决策导向——有「非目标」和优先级,说明不做什么;④ 足够具体可执行;⑤ 是能迭代的活文档。工具的每个功能都对应其中一条。

**做了哪些关键产品决策?**
1. 选"协作者"交互:先出草稿再精修,把"信息不足怎么办"从缺陷变成卖点——缺口显式变成假设与澄清问题。
2. 区分两类缺口:可推断的标为假设供确认;客观事实未知的留 `[待填写]`,不让模型幻觉编造。
3. 版本号与时间由应用确定性管理,不交给模型。
4. 无 key 自动进 Demo 模式,保证任何人打开都能体验完整流程。

**再给一周会优化什么?**
导出 PDF/Word、推送 Notion/飞书;按产品类型自适应模块;对单条假设/问题做局部重生成而非整篇刷新;PRD 质量自评分与改进建议;多语言。
```

- [ ] **Step 3: Verify the build still passes and the tree is clean**

Run: `cd "/Users/uw/Desktop/prd helper" && npm run build && git status --short`
Expected: build succeeds; only the new README/writeup are unstaged.

- [ ] **Step 4: Commit**

```bash
git add README.md docs/product-writeup.md
git commit -m "docs: add README and product writeup"
```

---

## Post-Implementation (manual, outside this plan)

These are deliverables the engineer cannot fully automate; do them after the code is done:

1. Record a screen capture of the full flow (input → streamed draft → answer a question → refined V0.2 → export). Save frames/clip under `docs/demo/`.
2. With a real `ANTHROPIC_API_KEY` in `.env.local`, smoke-test a few diverse prompts (a B2B tool, a consumer app, a deliberately vague one-liner) to confirm assumptions/questions behave well.
3. Fill the spec's §12 reference list with any open-source/article links actually consulted.
4. Create a **public** GitHub repo and push `main`. (Optional bonus: deploy to Vercel with the env var set and add the live URL to the README.)

---

## Self-Review Notes (author checklist — completed)

- **Spec coverage:** §3 interaction → Tasks 9/12/14 (generate+refine loop); §4 structure → Task 5 prompt; §4.0 metadata (app-owned, placeholders) → Tasks 4/10; §5 stack/layout → Tasks 1/14; §5.4 contract (`<<<PRD_META>>>`, app-owned version/time) → Tasks 3/5/9; §6 export → Tasks 4/13; §7 edge cases (vague→questions via prompt; unknown facts→`[待填写]`; no key→Demo; API error→friendly message; parse failure→graceful) → Tasks 5/7/8/3/9; §8 tests → Tasks 3/4/5/7/8.
- **Placeholders:** none — every code/test step contains complete content; `[待填写]` is an intentional product string, not a plan gap.
- **Type consistency:** `GenerateRequest`/`Turn`/`PrdMeta`/`ParsedGeneration` (Task 2) used consistently; `DocMeta` defined in Task 4 and consumed by Tasks 10/13/14; `ChatMessage` defined in Task 9 and consumed by Tasks 11/12; `streamGeneration`/`isMockMode` (Task 7) consumed by Task 8; `parseGeneration`/`stripMetaForDisplay`/`META_START`/`META_END` (Task 3) consumed by Tasks 7-test/9.
```
