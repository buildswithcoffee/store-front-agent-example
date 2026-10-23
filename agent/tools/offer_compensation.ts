import { defineWorkflowTool } from "eve/tools";
import { createWebhook, getWorkflowMetadata, setAttributes } from "workflow";
import { z } from "zod";

import { formatPrice } from "../../lib/format";
import { fileOffer, findLatestReturn, settleOffer, type OfferDecision } from "../../lib/returns";

export default defineWorkflowTool({
  description:
    "Offer goodwill compensation on a return. You propose the amount; " +
    "a store associate must approve it before it is final. Tell the shopper it is pending approval.",
  inputSchema: z.object({
    orderNumber: z.string().regex(/^\d{4,6}$/),
    itemSlug: z.string().describe("The item's slug, as passed to start_return"),
    amountCents: z.number().int().positive(),
    reason: z.string().describe("One sentence for the associate: why this shopper deserves the credit"),
  }),
  execution: "background",
  async execute({ orderNumber, itemSlug, amountCents, reason }) {
    "use workflow";

    const item = await lookupReturn(orderNumber, itemSlug);
    if (!item) return { error: `Start the return for ${itemSlug} on order ${orderNumber} first.` };

    // Label the run in the Vercel Workflows dashboard, in plain English.
    await setAttributes({
      order: `#${orderNumber}`,
      item: item.itemName,
      credit: formatPrice(amountCents),
      stage: "awaiting associate approval",
    });

    // Mint the URL an associate's decision will arrive on, then file the offer.
    const approval = createWebhook();
    const offer = await fileCompensationOffer(
      { returnId: item.id, amountCents, reason },
      approval.url,
      getWorkflowMetadata().workflowRunId,
    );

    // Pause here, durably, until a person decides. Minutes or days; nothing runs in between.
    const decision = (await (await approval).json()) as OfferDecision;

    await setAttributes({ stage: `${decision.decision} by associate` });
    return recordAssociateDecision(offer.id, decision);
  },
});

async function lookupReturn(orderNumber: string, itemSlug: string) {
  "use step";
  return findLatestReturn(orderNumber, itemSlug);
}

async function fileCompensationOffer(
  input: { returnId: number; amountCents: number; reason: string },
  decisionUrl: string,
  workflowRunId: string,
) {
  "use step";
  return fileOffer(input, decisionUrl, workflowRunId);
}

async function recordAssociateDecision(offerId: number, decision: OfferDecision) {
  "use step";
  return settleOffer(offerId, decision);
}
