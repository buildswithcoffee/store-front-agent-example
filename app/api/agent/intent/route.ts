import { getOrCreateCartId } from "@/lib/cart-cookie";
import { cartToken, SCOUT_URL } from "@/lib/scout";

// The chat panel calls this before dispatching a turn. Scout classifies the message with the
// same routing table its model router uses, so the intent shown in the drawer and the model
// that answers always agree. The answer's `note` goes along with the message as turn context.
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return new Response(null, { status: 403 });
  }
  const { token } = cartToken(await getOrCreateCartId());
  try {
    const response = await fetch(new URL("/storefront/intent", SCOUT_URL), {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: await request.text(),
      signal: request.signal,
    });
    return new Response(response.body, {
      status: response.status,
      headers: { "content-type": "application/json", "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json({ error: "Could not classify the message." }, { status: 503 });
  }
}
