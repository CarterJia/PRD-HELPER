import { streamEdit } from "@/lib/claude";
import type { EditRequest } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  let body: Partial<EditRequest>;
  try {
    body = (await req.json()) as Partial<EditRequest>;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { document, start, end, instruction } = body;
  if (
    typeof document !== "string" ||
    typeof start !== "number" ||
    typeof end !== "number" ||
    typeof instruction !== "string" ||
    !instruction.trim()
  ) {
    return new Response("document, start, end, instruction are required", { status: 400 });
  }
  if (start < 0 || end > document.length || start >= end) {
    return new Response("invalid range", { status: 400 });
  }

  const request: EditRequest = { document, start, end, instruction };
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of streamEdit(request)) {
          controller.enqueue(encoder.encode(chunk));
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "编辑失败";
        controller.enqueue(encoder.encode(`\n[编辑出错:${msg}]`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" },
  });
}
