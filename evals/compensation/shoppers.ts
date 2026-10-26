import { existsSync, readFileSync } from "node:fs";

import { neon } from "@neondatabase/serverless";
import type { EveEvalContext } from "eve/evals";

import { routingNote } from "../../agent/lib/classify";

// The shoppers in these evals. Every attempt gets its own brand-new order, so attempts
// never share data and the order is always recent enough to return. The evals.example.com
// addresses mark everything these evals create, so cleanup never touches a real order.
export const JORDAN = { name: "Jordan", email: "jordan@evals.example.com" };
export const ALEX = { name: "Alex", email: "alex@evals.example.com" };
export const EVAL_EMAILS = "%@evals.example.com";

const JACKET = { slug: "trail-shell-jacket", name: "Trail Shell Jacket", variant: "M / Burgundy", quantity: 1, priceCents: 14900 };

// The storefront classifies each message and sends this note with it. The evals send the
// same note, so Scout routes to the same model and loads the returns skill, as it does in the demo.
const returnsNote = routingNote("Refunds_and_exchanges", "returns-and-exchanges");

const PHOTO = "evals/photos/torn-jacket.jpg";

// The store's database. It must be the one the deployment under test uses; the npm
// commands load it from .env.local.
export function database() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set. Run the evals with npm run evals:before or evals:after.");
  return neon(process.env.DATABASE_URL);
}

export interface Order {
  number: string;
  email: string;
}

// Setup: a delivered burgundy jacket order for this shopper, placed six days ago,
// so it matches the photo the shopper sends.
export async function newOrder(shopper: { email: string }): Promise<Order> {
  const sql = database();
  const [row] = await sql`
    insert into orders (email, status, placed_at, items)
    values (${shopper.email}, 'delivered', current_date - 6, ${JSON.stringify([JACKET])}::jsonb)
    returning number`;
  return { number: row.number as string, email: shopper.email };
}

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
export async function confirmIfAsked(turn: Turn, text = "Yes, the burgundy Trail Shell Jacket. Please go ahead.") {
  return requested(turn, "start_return") ? turn : reply(turn, text);
}

// Cleanup: decline any credit Scout proposed, so its paused approval workflow finishes,
// then delete this attempt's returns and order.
export async function cleanUp(t: EveEvalContext, order: Order, last: Turn) {
  const sql = database();

  // The offer is filed by a background workflow, so it can land a few seconds after the chat.
  if (requested(last, "offer_compensation")) {
    const pending = await waitFor(async () => {
      const rows = await pendingOffers(order);
      return rows.length ? rows : undefined;
    });
    for (const offer of pending ?? []) {
      await t.target.fetch(new URL(offer.decision_url as string).pathname, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision: "declined", decidedBy: "Scout evals" }),
      });
    }
    await waitFor(async () => ((await pendingOffers(order)).length === 0 ? true : undefined));
  }

  // Deleting a return also deletes its offers and their adjustments.
  await sql`delete from returns where order_number = ${order.number}`;
  await sql`delete from orders where number = ${order.number} and email like ${EVAL_EMAILS}`;
}

function pendingOffers(order: Order) {
  return database()`
    select co.id, co.decision_url from compensation_offers co
    join returns r on r.id = co.return_id
    where r.order_number = ${order.number} and co.status = 'pending'`;
}

function requested(turn: Turn, tool: string) {
  return turn.session.events.some(
    (event) => event.type === "actions.requested" && JSON.stringify(event.data).includes(tool),
  );
}

async function waitFor<T>(check: () => Promise<T | undefined>, timeoutMs = 20_000): Promise<T | undefined> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await check();
    if (result !== undefined) return result;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return undefined;
}
