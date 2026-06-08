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
