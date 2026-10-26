// The AI Gateway virtual model behind every evaluate() call in the store. It tries
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
