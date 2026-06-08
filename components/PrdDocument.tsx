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
