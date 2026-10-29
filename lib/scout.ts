// Scout runs as its own Vercel project. The storefront vouches for each shopper with a
// short-lived token whose subject is their cart id, signed with the secret both projects share.
// Scout verifies it (scout-agent's agent/lib/storefront-token.ts) and binds the chat to that cart.
import { createHmac } from "node:crypto";

import type { CartToken } from "./scout-url";

export { SCOUT_URL } from "./scout-url";

const ISSUER = "northern-goods-storefront";
const AUDIENCE = "scout";
const TOKEN_TTL_SECONDS = 60 * 60;

export function cartToken(cartId: string): CartToken {
  const secret = process.env.SCOUT_STOREFRONT_SECRET;
  if (!secret) throw new Error("SCOUT_STOREFRONT_SECRET is not set.");

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + TOKEN_TTL_SECONDS;
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ iss: ISSUER, aud: AUDIENCE, sub: cartId, iat: now, exp: expiresAt })}`;
  const signature = createHmac("sha256", secret).update(unsigned).digest("base64url");
  return { token: `${unsigned}.${signature}`, expiresAt };
}
