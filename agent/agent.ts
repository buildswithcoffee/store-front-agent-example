import { defineAgent, defineDynamic } from "eve";

import { classifyIntent, DEFAULT_ROUTE, intentFromMessages, recentFromHistory, ROUTES } from "./lib/routing";

export default defineAgent({
  // Picked per turn from the shopper's classified intent. See agent/lib/routing.ts.
  model: defineDynamic({
    events: {
      "turn.started": async (_event, ctx) => {
        let intent = intentFromMessages(ctx.messages);
        if (!intent) {
          // The panel normally classifies before sending. If that context is missing
          // (a direct API call, or the classifier timed out), classify here.
          const recent = recentFromHistory(ctx.messages);
          const latest = recent.at(-1);
          if (latest?.role === "user")
            intent = (await classifyIntent(latest.text, recent.slice(0, -1)).catch(() => undefined))?.intent;
        }
        const route = intent ? ROUTES[intent] : DEFAULT_ROUTE;
        return {
          model: route.model,
          reasoning: route.reasoning,
          // AI Gateway tries these in order if the primary model fails.
          modelOptions: { providerOptions: { gateway: { models: route.fallbacks } } },
        };
      },
    },
  }),
  // Only the tools in agent/tools/. No shell, files, or web.
  defaultTools: false,
  // The root agent may not spawn copies of itself.
  tool: false,
});
