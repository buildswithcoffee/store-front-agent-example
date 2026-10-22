import { defineTool } from "eve/tools";
import { z } from "zod";

import { createReturn, RESOLUTIONS, RETURN_REASONS } from "../../lib/returns";
import { getOrder } from "../../lib/store";

export default defineTool({
  description:
    "Start a return, replacement, or exchange for an item on an order. " +
    "Verify the order with lookup_order first. For damaged or defective items, a clear photo counts as proof.",
  inputSchema: z.object({
    orderNumber: z.string().regex(/^\d{4,6}$/),
    email: z.string().email(),
    itemSlug: z.string(),
    variant: z.string().default(""),
    quantity: z.number().int().positive().default(1),
    reason: z.enum(RETURN_REASONS),
    damageKind: z.string().optional().describe("For damaged or defective items: what is wrong, e.g. torn_seam"),
    resolution: z.enum(RESOLUTIONS),
    photoNote: z.string().optional().describe("What the shopper's photo shows, if they sent one"),
  }),
  label: { start: ({ orderNumber }) => `Start a return on order ${orderNumber}` },
  async execute({ orderNumber, email, itemSlug, variant, quantity, ...rest }) {
    const order = await getOrder(orderNumber, email);
    if (!order) return { error: "No order matches that number and email." };

    const item = order.items.find((i) => i.slug === itemSlug);
    if (!item) return { error: `Order ${orderNumber} has no item ${itemSlug}.` };
    if (quantity > item.quantity) return { error: `Order ${orderNumber} only has ${item.quantity} of that item.` };

    const opened = await createReturn({
      orderNumber,
      itemSlug,
      itemName: item.name,
      variant: variant || item.variant,
      quantity,
      ...rest,
    });
    return { return: opened };
  },
});
