import { Experimental_DecisionRefusalError as DecisionRefusalError } from "ai";

// The AI Gateway virtual model behind every decide() call in the store. It tries
// typesafe-ai/jev first and falls back through luna-decisions and the rest of the chain
// configured in the Vercel dashboard, so this is the only place the store names a classifier.
export const EVALUATION_MODEL = "vmc/my-evaluation-models";

type EvaluationOutcome = {
  providerMetadata?: Record<string, Record<string, unknown>>;
  response: { modelId: string };
};

// The model in the chain that actually answered. The response's own model id is just the
// requested slug, so read the gateway's routing metadata, which names the model it settled on.
export function answeringModel({ providerMetadata, response }: EvaluationOutcome): string {
  const routing = providerMetadata?.gateway?.routing as { canonicalSlug?: unknown } | undefined;
  if (typeof routing?.canonicalSlug === "string") return routing.canonicalSlug;

  return response.modelId || EVALUATION_MODEL;
}

// A decision model can refuse a question instead of answering it. luna-decisions does this when no
// option is a confident fit, such as "running shoes" in a store that sells none. The gateway counts
// a refusal as a success, so the virtual model never falls back. Resolve to null so callers treat
// it as "no confident match".
export async function unlessRefused<T>(decision: Promise<T>): Promise<T | null> {
  try {
    return await decision;
  } catch (error) {
    if (DecisionRefusalError.isInstance(error)) return null;
    throw error;
  }
}
