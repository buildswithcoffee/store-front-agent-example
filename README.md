# Northstar Goods

A small storefront with an AI shopping assistant, built as a starter for trying out Vercel. It is deliberately simple: a Next.js app, a Neon Postgres database that seeds itself, and an [Eve](https://eve.dev) agent that classifies every message with [jev](https://ai-sdk.dev/docs/ai-sdk-core/evaluation) and routes it to the right model, skill, and tools.

No Shopify, no payments, no accounts. About 2,000 lines of TypeScript you can read in an afternoon.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fbuildswithcoffee%2Fstore-front-agent&project-name=store-front&repository-name=store-front&stores=%5B%7B%22type%22%3A%22integration%22%2C%22integrationSlug%22%3A%22neon%22%2C%22productSlug%22%3A%22neon%22%2C%22protocol%22%3A%22storage%22%7D%5D)

The button copies this repo into your GitHub account, creates a free Neon database, connects it to the new project, and deploys. On the first request the app creates its tables and loads the sample catalog. The assistant authenticates to AI Gateway with the deployment's own identity, so there are no API keys to set.

## What the store does

- **Catalog.** Twenty products across Apparel, Bags, Accessories, and Home, with a category filter on the home page and a product page with size and color options.
- **Cart.** Keyed by a browser cookie. Quantity controls, subtotal, and a demo "place order" that takes an email and creates an order. No payment is taken.
- **Orders.** Three seeded orders plus whatever you place. Try order `1001` with `demo@example.com` in the assistant.
- **Assistant.** The "Ask the store" button opens a chat drawer. It searches the catalog, renders product cards, gives sizing advice, checks and changes your cart, looks up orders, and answers shipping, returns, and promotion questions from short policy files.

Under each message you send, the drawer shows two chips: the intent jev detected, with its confidence, and the model Eve routed the turn to. That is the point of the demo. Ask "does the fleece run small?" and then "I want to return order 1002" and watch the model change.

## How the assistant is wired

Every message goes through the same path:

1. The drawer posts the message to `/api/agent/intent`. jev, an evaluation model, answers one typed question: which of seven shopper intents is this? It returns a choice and per-choice probabilities in well under a second.
2. The intent travels with the message as turn context.
3. Eve's model resolver in `agent/agent.ts` reads the intent and looks it up in **one routing map**, `agent/lib/routing.ts`. The row says which model answers, which models AI Gateway should fall back to if it fails, how much reasoning effort to use, and which skill to load.
4. A dynamic instructions entry reads the same row and tells the model to load that skill.
5. The model answers with the store's tools. Tool results that contain products render as cards.

The routing map is the file to edit:

| Intent | Model | Reasoning | Skill |
| --- | --- | --- | --- |
| Personal shopping | fast | low | none |
| Product details | fast | low | none |
| Sizing | fast | low | `sizing` |
| Promotions | fast | low | `promotions` |
| Refunds and exchanges | strong | medium | `returns-and-exchanges` |
| Technical support | strong | medium | `technical-support` |
| Shipping | strong | medium | `shipping` |

"Fast" and "strong" are two Gateway model IDs defined at the top of the file, each with an ordered fallback list. Change a model, add an intent, or point a row at a new skill and nothing else needs to change.

If the drawer's classification does not arrive, for example when the classifier times out, the resolver classifies the message itself so routing never silently defaults.

## Project layout

```
app/
  page.tsx                    Home: product grid with category chips
  products/[slug]/page.tsx    Product page with option selects and add to cart
  cart/page.tsx               Cart, quantity controls, demo checkout
  orders/[number]/page.tsx    Order confirmation
  setup/page.tsx              Shown instead of the store when DATABASE_URL is missing
  actions.ts                  Server actions: add to cart, update quantity, place order
  api/agent/session/route.ts  Ensures the cart cookie exists before the first chat message
  api/agent/intent/route.ts   Classifies a message with jev for the drawer

agent/
  agent.ts                    Model resolver: picks the model per turn from the routing map
  instructions.md             Who the assistant is and its standing rules
  instructions/routing.ts     Per-turn note naming the detected intent and skill to load
  channels/eve.ts             Public chat endpoint; binds the session to the cart cookie
  lib/routing.ts              Intents, the routing map, and the jev classifier
  tools/                      search_products, get_product, get_cart, add_to_cart,
                              update_cart_item, lookup_order
  skills/                     sizing, returns-and-exchanges, promotions, shipping,
                              technical-support (short markdown playbooks)

components/
  header.tsx, product-card.tsx, setup.tsx
  agent/chat.tsx              The chat drawer, product cards, and routing chips

lib/
  db.ts                       Neon client; creates tables and seeds on first use
  store.ts                    All data access: products, carts, orders
  cart-cookie.ts              The cart cookie (Next.js only; the agent never imports it)
  format.ts                   Price formatting

db/
  schema.ts                   Four tables: products, carts, cart_items, orders
  reset.ts                    Drops everything so the app reseeds

data/
  products.json               The catalog, the source of truth for seeding
  orders.json                 Three demo orders

public/products/              One generated SVG per product
```

The agent's tools call the same functions in `lib/store.ts` that the pages use. There is no separate API layer for the assistant.

## Run it locally

You need Node 24 and the [Vercel CLI](https://vercel.com/docs/cli).

```bash
git clone https://github.com/buildswithcoffee/store-front-agent
cd store-front-agent
npm install
```

Link the folder to a Vercel project. If you used the Deploy button, pick the project it created; otherwise let the CLI create one.

```bash
vercel link
```

If the project does not have a Neon database yet, create one. The dashboard route is Storage, then Create Database, then Neon. Make sure **Development** is checked along with Production and Preview when you connect it, otherwise the next step pulls nothing. From the CLI:

```bash
vercel install neon --plan free_v3 -e production -e preview -e development
```

Pull the environment variables. This brings down `DATABASE_URL` and a short-lived OIDC token the assistant uses to reach AI Gateway.

```bash
vercel env pull
```

Start the app. Next.js and the Eve agent start together.

```bash
npm run dev
```

Open http://localhost:3000. The first request creates the tables and loads the catalog.

Two things to know:

- The OIDC token in `.env.local` expires after about twelve hours. If the assistant stops answering locally, run `vercel env pull` again.
- If your Vercel CLI defaults to a different team than the project's, add `--scope <team>` to the commands above.

### Reset the data

```bash
npm run db:reset
```

Drops all four tables. The next request recreates and reseeds them.

## Things to try

- "a jacket under $150"
- "does the trail shell jacket run big? I wear a medium"
- "add the wool beanie in charcoal to my cart"
- "what's in my cart?"
- "how long does shipping take?" and then "does that apply to Alaska?"
- "I want to return the beanie from order 1001, my email is demo@example.com"

Place an order from the cart page, then ask the assistant about it by number and email.

## Environment variables

| Variable | Set by | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Neon integration | Postgres connection string. The app shows a setup page without it. |
| `VERCEL_OIDC_TOKEN` | Vercel, on deploy and `vercel env pull` | Authenticates the assistant to AI Gateway. No API key needed. |
| `AI_GATEWAY_API_KEY` | you, optionally | Use instead of OIDC if you prefer a key. |

The Neon integration also sets `POSTGRES_URL` and a few `PG*` variables. The app uses only `DATABASE_URL`.

## Design notes

- **The database is never public.** The connection string lives in server environment variables. The browser talks to the Next.js app, and only the app talks to Neon. The only write paths are the cart and the demo order.
- **The cart ID comes from the cookie, never from the model.** The channel reads the cookie and attaches the cart to the session. Tools read it from there, so a message cannot name someone else's cart.
- **Skills are short.** Each is ten to twenty lines of policy and procedure. The model loads one per turn based on the routed intent, so the always-on prompt stays small.
- **Switching models per turn costs prompt cache.** Eve's docs prefer picking once per session for that reason. This demo switches per turn on purpose, because watching the route change is the feature. For a few short turns the cost is negligible.
- **No tests, no linting config, no component library.** Everything is meant to be read.

## Not included

Payments, customer accounts, inventory, real shipping, and product photography. The images are generated geometric placeholders tinted by each product's first color.
