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
