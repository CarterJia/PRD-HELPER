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
