import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt, buildMessages, buildEditSystemPrompt, buildEditMessages } from "./prompt";
import type { GenerateRequest, EditRequest } from "./types";
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
