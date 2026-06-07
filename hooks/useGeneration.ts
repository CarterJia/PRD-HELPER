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
