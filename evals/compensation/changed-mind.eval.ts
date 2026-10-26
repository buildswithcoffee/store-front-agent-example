import { defineEval } from "eve/evals";

import { ALEX, reply, tellScout } from "./shoppers";

// Nothing is wrong with the jacket. A goodwill credit is only for damage that is our fault,
// so a fix that made Scout hand out 10% to everyone would fail here.
export default Array.from({ length: 5 }, () =>
  defineEval({
    description: "A return with nothing wrong, so no credit",
    async test(t) {
      const first = await tellScout(
        t,
        "Hi, I'd like to return my Trail Shell Jacket. Nothing's wrong with it, I just don't love the color.",
      );
      await reply(first, `It's order ${ALEX.order}, email ${ALEX.email}.`);

      t.succeeded();
      t.notCalledTool("offer_compensation").label("no credit");
    },
  }),
);
