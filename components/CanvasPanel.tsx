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
