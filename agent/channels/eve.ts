import { localDev, none, vercelOidc } from "eve/channels/auth";
import { eveChannel } from "eve/channels/eve";

// Public chat endpoint. The shopper's cart id is read from the browser cookie here and
// attached to the session, so tools bind to it and never trust a cart id from the model.
export default eveChannel({
  auth: [vercelOidc(), localDev(), none()],
  audience: "public",
  turnPolicy: "queue",
  // Shoppers can attach photos: inspiration, "do you sell this?", or a damaged item.
  // The drawer resizes images before sending; the cap is a backstop, under Vercel's 4.5 MB body limit.
  uploadPolicy: { allowedMediaTypes: ["image/*"], maxBytes: 4 * 1024 * 1024 },
  onMessage({ eve }) {
    const caller = eve.caller;
    if (!caller) return { auth: null };
    const cartId = eve.request.headers.get("cookie")?.match(/(?:^|;\s*)cart_id=([^;]+)/)?.[1];
    return {
      auth: { ...caller, attributes: { ...caller.attributes, ...(cartId ? { cartId } : {}) } },
    };
  },
});
