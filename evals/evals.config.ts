import { defineEvalConfig } from "eve/evals";

// Every check in these evals is an exact rule, so there is no judge model to configure.
// Each run of a case is a real chat with Scout, and a slow one can take a minute.
export default defineEvalConfig({
  timeoutMs: 180_000,
});
