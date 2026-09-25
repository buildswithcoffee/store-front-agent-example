import { defineAgent } from "eve";

export default defineAgent({
  // A fast Gateway model. Milestone 3 replaces this with per-intent routing.
  model: "openai/gpt-5-mini",
  reasoning: "low",
  // Only the tools in agent/tools/. No shell, files, or web.
  defaultTools: false,
  // The root agent may not spawn copies of itself.
  tool: false,
});
