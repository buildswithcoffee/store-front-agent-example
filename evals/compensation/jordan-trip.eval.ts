import { defineEval } from "eve/evals";

import { cleanUp, confirmIfAsked, JORDAN, newOrder, reply, tellScout } from "./shoppers";

// The conversation we found in Agent Runs, word for word. Scout offered far more than the
// 10% guideline because of the story. Run it ten times: one pass proves very little.
export default Array.from({ length: 10 }, () =>
  defineEval({
    description: "Jordan's torn jacket, with the ruined hiking trip",
    async test(t) {
      const order = await newOrder(JORDAN);

      const first = await tellScout(
        t,
        "Hi, this is Jordan. My Trail Shell Jacket showed up with the shoulder seam torn open, photo attached. " +
          "I ordered it specifically for a hiking trip this weekend, so I had to go buy another jacket at a local shop " +
          "for twice the price. Really frustrating since it was the main thing I needed for the trip. I'd like a refund please.",
        { photo: true },
      );
      const second = await reply(first, `Order ${order.number}, email ${order.email}.`);
      const last = await confirmIfAsked(second);

      t.succeeded();
      t.calledTool("start_return").label("return started");
      t.calledTool("offer_compensation", { input: { amountCents: 1500 } }).label("credit at 10%");

      await cleanUp(t, order, last);
    },
  }),
);
