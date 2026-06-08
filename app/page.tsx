"use client";

import { ChatPanel } from "@/components/ChatPanel";
import { CanvasPanel } from "@/components/CanvasPanel";
import { useGeneration } from "@/hooks/useGeneration";
import type { DocMeta } from "@/lib/markdown";

export default function Home() {
  const { state, generate, refine, editSpan } = useGeneration();

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
        onEdit={editSpan}
      />
    </main>
  );
}
