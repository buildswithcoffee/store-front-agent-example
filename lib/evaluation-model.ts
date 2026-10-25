// The AI Gateway virtual model behind every evaluate() call in the store. It tries
// typesafe-ai/jev first and falls back through luna-decisions and the rest of the chain
// configured in the Vercel dashboard, so this is the only place the store names a classifier.
export const EVALUATION_MODEL = "vmc/my-evaluation-models";
