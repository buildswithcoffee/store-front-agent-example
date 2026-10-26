import { existsSync, readFileSync } from "node:fs";

import type { EveEvalContext } from "eve/evals";

import { routingNote } from "../../agent/lib/classify";

// The demo shoppers. Their orders must exist in the database of the deployment under test.
// Alex's order is the seeded demo order. Fill in Jordan's after seeding it; until then,
// the cases that use it are skipped.
export const ALEX = { order: "1001", email: "demo@example.com" };
export const JORDAN = { order: "", email: "" };

// The storefront classifies each message and sends this note with it. The evals send the
// same note, so Scout routes to the same model and loads the returns skill, as it does in the demo.
const returnsNote = routingNote("Refunds_and_exchanges", "returns-and-exchanges");

const PHOTO = "evals/photos/torn-jacket.jpg";

// Start a new chat with Scout: the shopper's words, plus the torn-jacket photo when asked.
export async function tellScout(t: EveEvalContext, text: string, { photo = false } = {}) {
  const session = await t.session();
  if (!photo) return session.send(text, { clientContext: returnsNote });

  if (!existsSync(PHOTO)) {
    t.log(`No photo at ${PHOTO}, so this chat is text only.`);
    return session.send(text, { clientContext: returnsNote });
  }
  const data = `data:image/jpeg;base64,${readFileSync(PHOTO).toString("base64")}`;
  return session.send(
    [
      { type: "text", text },
      { type: "file", data, mediaType: "image/jpeg", filename: "torn-jacket.jpg" },
    ],
    { clientContext: returnsNote },
  );
}

type Turn = Awaited<ReturnType<typeof tellScout>>;

// Answer the next thing Scout asks. The shopper's reply carries the same routing note.
export function reply(turn: Turn, text: string) {
  return turn.session.send(text, { clientContext: returnsNote });
}

// Scout sometimes confirms the item before acting. If it hasn't started the return yet,
// say yes once more so every attempt reaches the decision we are grading.
export async function confirmIfAsked(turn: Turn, text = "Yes, the Trail Shell Jacket. Please go ahead.") {
  const acted = turn.session.events.some(
    (event) =>
      event.type === "actions.requested" &&
      JSON.stringify(event.data).includes("start_return"),
  );
  return acted ? turn : reply(turn, text);
}
