import { experimental_evaluate as evaluate, type ModelMessage } from "ai";

// One row per shopper intent. jev classifies each message into one of these, and
// the row decides which model answers, what it falls back to, how hard it thinks,
// and which skill to load. Edit this file to change the routing.

export const SHOPPER_INTENTS = {
  Personal_shopping: "Wants help choosing what to buy.",
  Product_details: "Asking about a product's specs, materials, or availability.",
  Sizing: "Asking about size or fit.",
  Promotions: "Asking about discounts or deals.",
  Refunds_and_exchanges: "Wants to return or exchange an item, or get money back.",
  Technical_support: "Something on the site is broken or not working.",
  Shipping: "Questions about how to get the product, change addresses, special instructions on receiving."
} as const;

export type ShopperIntent = keyof typeof SHOPPER_INTENTS;

const FAST = "openai/gpt-5-mini";
const STRONG = "anthropic/claude-sonnet-5";

export interface Route {
  model: string;
  /** Tried in order by AI Gateway if `model` fails. */
  fallbacks: string[];
  reasoning: "low" | "medium";
  skill: string | null;
}

export const ROUTES: Record<ShopperIntent, Route> = {
  Personal_shopping:     { model: FAST,   fallbacks: ["google/gemini-3.5-flash", STRONG], reasoning: "low",    skill: null },
  Product_details:       { model: FAST,   fallbacks: ["google/gemini-3.5-flash", STRONG], reasoning: "low",    skill: null },
  Sizing:                { model: FAST,   fallbacks: ["google/gemini-3.5-flash", STRONG], reasoning: "low",    skill: "sizing" },
  Promotions:            { model: FAST,   fallbacks: ["google/gemini-3.5-flash", STRONG], reasoning: "low",    skill: "promotions" },
  Refunds_and_exchanges: { model: STRONG, fallbacks: ["openai/gpt-5.2", FAST],            reasoning: "medium", skill: "returns-and-exchanges" },
  Technical_support:     { model: STRONG, fallbacks: ["openai/gpt-5.2", FAST],            reasoning: "medium", skill: "technical-support" },
  Shipping:              { model: STRONG, fallbacks: ["openai/gpt-5.2", FAST],            reasoning: "medium", skill: "shipping" },
};

export const DEFAULT_ROUTE = ROUTES.Personal_shopping;

export function isShopperIntent(value: unknown): value is ShopperIntent {
  return typeof value === "string" && value in SHOPPER_INTENTS;
}

/** A few prior turns, so a short follow-up like "and to Alaska?" keeps its topic. */
export type RecentMessage = { role: "user" | "assistant"; text: string };

// jev is an evaluation model: it answers a typed question with per-choice probabilities
// instead of generating text, which makes it fast and cheap enough to run before every turn.
export async function classifyIntent(
  message: string,
  recent: RecentMessage[] = [],
  abortSignal?: AbortSignal,
) {
  const { answers } = await evaluate({
    abortSignal,
    model: "typesafe-ai/jev",
    state: { recent, message },
    questions: {
      intent: {
        type: "choice",
        instructions:
          "What is the shopper asking for in `message`? Use `recent` only to resolve what a short follow-up refers to.",
        criteria: SHOPPER_INTENTS,
      },
    },
  });
  const { choice, probabilities } = answers.intent;
  return { intent: choice, confidence: probabilities?.[choice] };
}

// The chat panel sends its classification as turn context, which Eve turns into a
// user-role message containing JSON. Find it in the most recent messages.
export function intentFromMessages(messages: readonly ModelMessage[]): ShopperIntent | undefined {
  for (let i = messages.length - 1; i >= 0 && i >= messages.length - 4; i--) {
    const message = messages[i];
    if (message.role !== "user") continue;
    const parts = typeof message.content === "string" ? [message.content] : message.content.map((p) => ("text" in p ? p.text : ""));
    for (const text of parts) {
      const match = text.match(/"detectedIntent"\s*:\s*\{[^}]*"intent"\s*:\s*"([A-Za-z_]+)"/);
      if (match && isShopperIntent(match[1])) return match[1];
    }
  }
  return undefined;
}

// The conversation as plain role/text pairs, newest last, skipping tool traffic and
// the JSON context messages. Used by the resolver's fallback classification.
export function recentFromHistory(messages: readonly ModelMessage[], limit = 5): RecentMessage[] {
  const recent: RecentMessage[] = [];
  for (const message of messages) {
    if (message.role !== "user" && message.role !== "assistant") continue;
    const text =
      typeof message.content === "string"
        ? message.content
        : message.content.map((p) => (p.type === "text" ? p.text : "")).join(" ");
    if (text.trim() && !text.includes('"detectedIntent"')) recent.push({ role: message.role, text });
  }
  return recent.slice(-limit);
}
