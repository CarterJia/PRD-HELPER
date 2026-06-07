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
