// Where Scout runs, for the chat panel and the server routes. Kept apart from lib/scout.ts,
// which signs tokens with node:crypto and must stay out of the browser bundle.
export const SCOUT_URL = process.env.NEXT_PUBLIC_SCOUT_URL ?? "https://scout-agent.verceldemo.com";

export interface CartToken {
  token: string;
  /** Unix seconds. */
  expiresAt: number;
}
