import { z } from "zod";

import { classifyIntent } from "@/agent/lib/routing";

const body = z.object({ message: z.string().trim().min(1).max(4000) });

// The chat panel calls this before dispatching a turn so it can show the detected
// intent and pass it along as turn context for the agent's model and skill routing.
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return new Response(null, { status: 403 });
  }
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new Response(null, { status: 400 });
  try {
    const result = await classifyIntent(parsed.data.message, request.signal);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Could not classify the message." }, { status: 503 });
  }
}
