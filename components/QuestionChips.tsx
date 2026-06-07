"use client";

interface Props {
  questions: string[];
  onPick: (question: string) => void;
}

export function QuestionChips({ questions, onPick }: Props) {
  if (questions.length === 0) return null;
  return (
    <div className="self-start w-[90%] rounded-xl border border-indigo-100 bg-indigo-50/60 p-3">
      <p className="mb-2 text-xs font-medium text-indigo-700">
        回答这些问题能让 PRD 更准:
      </p>
      <div className="flex flex-col gap-2">
        {questions.map((q, i) => (
          <button
            key={i}
            onClick={() => onPick(q)}
            className="rounded-lg border border-indigo-200 bg-white px-3 py-2 text-left text-sm text-slate-700 transition hover:border-indigo-400 hover:bg-indigo-50"
          >
            ❓ {q}
          </button>
        ))}
      </div>
    </div>
  );
}
