import { experimental_decide as decide, type ModelMessage } from "ai";

import { answeringModel, EVALUATION_MODEL, unlessRefused } from "../../lib/evaluation-model";

export const SHOPPER_INTENTS = {
  Personal_shopping: "Wants help choosing what to buy, including finding things like a photo they shared.",
  Product_details: "Asking about a product's specs, materials, or availability, or whether we sell something shown in a photo.",
  Sizing: "Asking about size or fit.",
  Promotions: "Asking about discounts or deals.",
  Refunds_and_exchanges: "Wants to return or exchange an item, get money back, or shows a damaged or wrong item.",
  Technical_support: "Something on the site is broken or not working.",
  Shipping: "Questions about how to get the product, change addresses, special instructions on receiving.",
} as const;
export type ShopperIntent = keyof typeof SHOPPER_INTENTS;


type RecentMessage = { role: "user" | "assistant"; text: string };


// Ask the evaluation model which intent a message has. `recent` keeps a follow-up on topic.
// The classifier only reads text, so `hasPhoto` tells it when a photo came along with the words.
// Returns null when the model refuses to pick an intent.
export async function classifyIntent(
  message: string,
  recent: RecentMessage[] = [],
  abortSignal?: AbortSignal,
  hasPhoto = false,
) {
  const result = await unlessRefused(decide({
    abortSignal,
    model: EVALUATION_MODEL,
    state: {
      recent,
      message,
      photo: hasPhoto ? "The shopper attached a photo to this message." : "No photo attached.",
    },
    questions: {
      intent: {
        type: "choice",
        instructions:
          "What is the shopper asking for in `message`? Use `recent` only to resolve what a short follow-up refers to. " +
          "`photo` says whether a photo came with the message. A photo with little or no text is usually about finding or identifying products, unless the words mention damage or a problem.",
        criteria: SHOPPER_INTENTS,
      },
    },
  }));
  if (!result) return null;

  const { choice, probabilities } = result.answers.intent;

  return {
    intent: choice,
    confidence: probabilities?.[choice],
    // Whichever model in the virtual model's chain answered, so the drawer can show a fallback.
    classifier: answeringModel(result),
  };
}


// The sentence the chat panel sends with each message. The model reads it as a user message.
export function routingNote(intent: ShopperIntent, skill: string | null): string {
  return [
    `Routing note: this message was classified as ${intent}.`,
    skill ? `Load the "${skill}" skill before answering.` : "",
    "Treat the classification as a hint, not as proof of what the shopper owns or wants.",
  ]
    .filter(Boolean)
    .join(" ");
}


// Read the intent back out of the routing note.
export function intentFromMessages(messages: readonly ModelMessage[]): ShopperIntent | undefined {
  for (const message of messages.slice(-4).reverse()) {
    if (message.role !== "user") continue;

    const match = textOf(message).match(/classified as ([A-Za-z_]+)\./);
    if (match && match[1] in SHOPPER_INTENTS) return match[1] as ShopperIntent;
  }

  return undefined;
}



// The conversation as plain text, newest last. Skips tool traffic and routing notes.
export function recentFromHistory(messages: readonly ModelMessage[], limit = 5): RecentMessage[] {
  const recent: RecentMessage[] = [];

  for (const message of messages) {
    if (message.role !== "user" && message.role !== "assistant") continue;

    const text = textOf(message).trim();
    if (text && !text.startsWith("Routing note:")) recent.push({ role: message.role, text });
  }

  return recent.slice(-limit);
}


function textOf(message: ModelMessage): string {
  if (typeof message.content === "string") return message.content;

  return message.content.map((part) => (part.type === "text" ? part.text : "")).join(" ");
}
