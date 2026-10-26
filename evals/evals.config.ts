import { defineEvalConfig } from "eve/evals";

import { database, EVAL_EMAILS } from "./compensation/shoppers";

// Every check in these evals is an exact rule, so there is no judge model to configure.
// Each attempt is a real chat with Scout, and a slow one can take a minute.
export default defineEvalConfig({
  timeoutMs: 180_000,

  // Each attempt creates and removes its own order. This is a safety net for attempts
  // that stopped early: anything left behind with an evals.example.com address goes.
  async teardown() {
    const sql = database();
    await sql`delete from returns where order_number in (select number from orders where email like ${EVAL_EMAILS})`;
    await sql`delete from orders where email like ${EVAL_EMAILS}`;
  },
});
