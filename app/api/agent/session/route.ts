import { getOrCreateCartId } from "@/lib/cart-cookie";
import { cartToken } from "@/lib/scout";

// The chat panel calls this for the token it sends to Scout. Making sure the cart cookie
// exists first means the chat and the cart page share one cart.
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return new Response(null, { status: 403 });
  }
  const cartId = await getOrCreateCartId();
  return Response.json(cartToken(cartId), { headers: { "Cache-Control": "no-store" } });
}
