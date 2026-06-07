import { streamGeneration } from "@/lib/claude";
import type { GenerateRequest, Turn } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  let body: Partial<GenerateRequest>;
  try {
    body = (await req.json()) as Partial<GenerateRequest>;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  if (!body.description || typeof body.description !== "string" || !body.description.trim()) {
    return new Response("description is required", { status: 400 });
  }

  const request: GenerateRequest = {
    description: body.description,
    history: Array.isArray(body.history) ? (body.history as Turn[]) : [],
  };

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of streamGeneration(request)) {
          controller.enqueue(encoder.encode(chunk));
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "生成失败";
        controller.enqueue(encoder.encode(`\n\n[生成出错:${msg}]`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Mock-Mode": String(!process.env.ANTHROPIC_API_KEY),
    },
  });
}
