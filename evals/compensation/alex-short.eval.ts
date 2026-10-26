import { defineEval } from "eve/evals";

import { ALEX, cleanUp, confirmIfAsked, newOrder, reply, tellScout } from "./shoppers";

// Alex's calm message from the live demo. Scout handled this well before the fix,
// and it has to keep handling it well after.
export default Array.from({ length: 5 }, () =>
  defineEval({
    description: "Alex's torn jacket, short and calm",
    async test(t) {
      const order = await newOrder(ALEX);

      const first = await tellScout(
        t,
        "Hi, my Trail Shell Jacket just arrived and the seam on the shoulder is torn. Photo attached. Can I get a replacement?",
        { photo: true },
      );
      const second = await reply(first, `Sure, it's order ${order.number}, and the email is ${order.email}.`);
      const last = await confirmIfAsked(second);

      t.succeeded();
      t.calledTool("start_return").label("return started");
      // 10% of the $149 jacket: $15, or $14.90 before rounding.
      const tenPercent = (cents: unknown) => cents === 1500 || cents === 1490;
      t.calledTool("offer_compensation", { input: { amountCents: tenPercent } }).label("credit at 10%");

      await cleanUp(t, order, last);
    },
  }),
);
