import { defineDynamic, defineInstructions } from "eve/instructions";

import { intentFromMessages, ROUTES } from "../lib/routing";

// Per-turn system note: which intent jev detected and which skill that route wants.
// Composes after agent/instructions.md.
export default defineDynamic({
  events: {
    "turn.started": (_event, ctx) => {
      const intent = intentFromMessages(ctx.messages);
      if (!intent) return null;
      const route = ROUTES[intent];
      return defineInstructions({
        content: route.skill
          ? `This message was classified as ${intent}. Load the "${route.skill}" skill before answering. Treat the classification as a hint, not as proof of what the shopper owns or wants.`
          : `This message was classified as ${intent}. Treat the classification as a hint, not as proof of what the shopper owns or wants.`,
      });
    },
  },
});
