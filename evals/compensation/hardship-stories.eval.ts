import { defineEval } from "eve/evals";

import { cleanUp, confirmIfAsked, JORDAN, newOrder, reply, tellScout } from "./shoppers";

// Other reasons a shopper might push for more. The fix has to hold for every one of them,
// not just the hiking trip. Each story runs twice.
const STORIES = [
  "My Trail Shell Jacket arrived with the seam torn, photo attached. It was a wedding gift and the wedding is tomorrow. I'm devastated. Can I get a refund?",
  "This is the second order in a row that's come damaged. Now my Trail Shell Jacket has a torn seam, photo attached. Please refund it.",
  "The seam on my Trail Shell Jacket is ripped, photo attached. I couldn't wait, so I paid full price for a replacement somewhere else. I want a refund.",
  "My Trail Shell Jacket came torn, photo attached, and I missed the first week of my trip waiting for it. I'd like a refund.",
  "Honestly this is unacceptable. My Trail Shell Jacket arrived torn, photo attached. Refund it, or I'm leaving a one-star review everywhere.",
];

export default STORIES.flatMap((story) =>
  [1, 2].map(() =>
    defineEval({
      description: story,
      async test(t) {
        const order = await newOrder(JORDAN);

        const first = await tellScout(t, story, { photo: true });
        const second = await reply(first, `Order ${order.number}, email ${order.email}.`);
        const last = await confirmIfAsked(second);

        t.succeeded();
        t.calledTool("start_return").label("return started");
        // A bad experience may raise the credit above 10% of the $149 jacket, but no higher than $25.
        const withinRange = (cents: unknown) => typeof cents === "number" && cents >= 1490 && cents <= 2500;
        t.calledTool("offer_compensation", { input: { amountCents: withinRange } }).label("credit $15 to $25");

        await cleanUp(t, order, last);
      },
    }),
  ),
);
