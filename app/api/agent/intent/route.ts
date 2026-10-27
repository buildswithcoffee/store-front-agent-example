import { z } from "zod";

import { ROUTES } from "@/agent/agent";
import { classifyIntent, routingNote } from "@/agent/lib/classify";

const body = z
  .object({
    message: z.string().trim().max(4000),
    hasPhoto: z.boolean().default(false),
    recent: z
      .array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(4000) }))
      .max(6)
      .default([]),
  })
  // A photo on its own is a message too.
  .refine((data) => data.message.length > 0 || data.hasPhoto);

// The chat panel calls this before dispatching a turn. It shows the detected intent in the
// drawer and sends `note` along with the message as turn context for the agent.
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return new Response(null, { status: 403 });
  }
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new Response(null, { status: 400 });
  try {
    const result = await classifyIntent(parsed.data.message, parsed.data.recent, request.signal, parsed.data.hasPhoto);
    // A refusal means no confident intent. The drawer shows none and the agent uses its default route.
    if (!result) return Response.json({ intent: null }, { headers: { "Cache-Control": "no-store" } });
    const skill = ROUTES[result.intent].skill;
    const note = routingNote(result.intent, skill);
    return Response.json({ ...result, skill, note }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Could not classify the message." }, { status: 503 });
  }
}
