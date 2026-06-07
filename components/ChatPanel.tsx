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
