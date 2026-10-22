import { defineWorkflowTool } from "eve/tools";
import { createWebhook } from "workflow";
import { z } from "zod";

import { fileOffer, settleOffer, type OfferDecision } from "../../lib/returns";

export default defineWorkflowTool({
  description:
    "Offer goodwill compensation on a return. You propose the amount; " +
    "a store associate must approve it before it is final. Tell the shopper it is pending approval.",
  inputSchema: z.object({
    returnId: z.number().int(),
    amountCents: z.number().int().positive(),
    reason: z.string().describe("One sentence for the associate: why this shopper deserves the credit"),
  }),
  execution: "background",
  async execute(input, ctx) {
    "use workflow";

    // Mint the URL an associate's decision will arrive on, then file the offer.
    const approval = createWebhook();
    const offer = await file(input, approval.url);

    // Pause here, durably, until a person decides. Minutes or days; nothing runs in between.
    const response = await approval;
    const decision = (await response.json()) as OfferDecision;

    return settle(offer.id, decision);
  },
});

async function file(input: { returnId: number; amountCents: number; reason: string }, decisionUrl: string) {
  "use step";
  return fileOffer(input, decisionUrl);
}

async function settle(offerId: number, decision: OfferDecision) {
  "use step";
  return settleOffer(offerId, decision);
}
