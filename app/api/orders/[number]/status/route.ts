import { z } from "zod";

import { ORDER_STATUSES, updateOrderStatus } from "@/lib/store";

const body = z.object({ status: z.enum(ORDER_STATUSES) });

// Lets fulfillment suppliers move an order along from their own systems. They
// authenticate with the shared token in SUPPLIER_API_TOKEN.
// Try: curl -X PATCH localhost:3000/api/orders/1001/status -H "authorization: Bearer $SUPPLIER_API_TOKEN" \
//        -H 'content-type: application/json' -d '{"status":"shipped"}'
export async function PATCH(request: Request, { params }: { params: Promise<{ number: string }> }) {
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (token !== process.env.SUPPLIER_API_TOKEN) {
    return Response.json({ error: "Invalid supplier token." }, { status: 401 });
  }

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: `"status" must be one of: ${ORDER_STATUSES.join(", ")}.` }, { status: 400 });
  }

  const { number } = await params;
  const order = await updateOrderStatus(number, parsed.data.status);
  if (!order) return Response.json({ error: `No order ${number}.` }, { status: 404 });

  return Response.json({ number: order.number, status: order.status });
}
