# Northstar Goods - Example Storefront with Jev-powered Search and Agent via Vercel AI Gateway

A demo storefront with Scout, an AI shopping assistant. It is a Next.js app backed by a Neon Postgres database. Scout is an [Eve](https://eve.dev) agent that picks a model for each message based on what the shopper is asking. It runs as its own Vercel project, from [buildswithcoffee/scout-agent](https://github.com/buildswithcoffee/scout-agent), and the chat drawer here talks to it.

## Getting started

You can set this up with the Deploy button or by hand. Either way, the assistant uses the project's OIDC token to call AI Gateway, so you don't need to set any API keys. Model usage is billed to your Vercel team through AI Gateway.

### Option 1: Deploy button

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fbuildswithcoffee%2Fstore-front-agent-example&project-name=store-front&repository-name=store-front&stores=%5B%7B%22type%22%3A%22integration%22%2C%22integrationSlug%22%3A%22neon%22%2C%22productSlug%22%3A%22neon%22%2C%22protocol%22%3A%22storage%22%7D%5D)

The button copies this repo into your GitHub account, creates a Vercel project and a free Neon database, connects them, and deploys. The first request to the site creates the tables and loads the sample catalog.

To run your copy locally, you need Node 24 and the [Vercel CLI](https://vercel.com/docs/cli) (`npm i -g vercel`):

```bash
git clone https://github.com/<your-account>/store-front
cd store-front
npm install
vercel link
vercel env pull
npm run dev
```

When `vercel link` asks, pick the project the button created. If `vercel env pull` doesn't bring down `DATABASE_URL`, connect the Neon database to the Development environment in the project's Storage tab and pull again.

### Option 2: Set up by hand

You need Node 24 and the [Vercel CLI](https://vercel.com/docs/cli) (`npm i -g vercel`).

1. Clone the repo and install dependencies.

   ```bash
   git clone https://github.com/buildswithcoffee/store-front-agent-example
   cd store-front-agent-example
   npm install
   ```

2. Create a Vercel project and link the folder to it.

   ```bash
   vercel link
   ```

3. Add a Neon database to the project. In the dashboard, go to Storage, then Create Database, then Neon, and check Development, Preview, and Production when you connect it. Or from the CLI:

   ```bash
   vercel install neon --plan free_v3 -e production -e preview -e development
   ```

4. Pull the environment variables into `.env.local`. This gets `DATABASE_URL` and an OIDC token for AI Gateway.

   ```bash
   vercel env pull
   ```

5. Start the app and open http://localhost:3000. The first request creates the tables and loads the catalog.

   ```bash
   npm run dev
   ```

6. When you're ready, deploy it.

   ```bash
   vercel deploy --prod
   ```

### Connect Scout

The store works on its own, but the "Ask Scout" drawer needs a Scout deployment. Deploy [scout-agent](https://github.com/buildswithcoffee/scout-agent) to its own Vercel project, connect it to the same Neon database, then give both projects the same random `SCOUT_STOREFRONT_SECRET`:

```bash
openssl rand -hex 32   # use the output as the value in both projects
vercel env add SCOUT_STOREFRONT_SECRET
```

If Scout isn't at `https://scout-agent.verceldemo.com`, set `NEXT_PUBLIC_SCOUT_URL` to its address. Locally, run Scout with `eve dev` and put `NEXT_PUBLIC_SCOUT_URL=http://127.0.0.1:2000` in `.env.local`.

### Notes

- The OIDC token in `.env.local` expires after about 12 hours. If search stops falling back locally, run `vercel env pull` again.
- If your Vercel CLI defaults to a different team than the project's, add `--scope <team>` to the `vercel` commands.

## Things to try

Open Scout with the "Ask Scout" button and try:

- "a jacket under $150"
- "does the trail shell jacket run big? I wear a medium"
- "add the wool beanie in charcoal to my cart"
- "what's in my cart?"
- "how long does shipping take?" then "does that apply to Alaska?"
- "I want to return the beanie from order 1001, my email is demo@example.com"
- Attach a photo (the camera button, or paste one) and ask "do you have anything like this?"

Under each message, the drawer shows the intent that was detected and the model that answered. Ask a sizing question and then a returns question to see the model change.

The search box in the header also handles typos ("sweaater") and vague terms ("athletic").

## Store admin

`/admin/orders` lists every order and lets you change its status. It isn't linked from the storefront. Set `ADMIN_PASSWORD` to turn it on, then sign in at `/admin/login`:

```bash
vercel env add ADMIN_PASSWORD
vercel env pull
```

Add it to each environment you want the admin area in. `vercel env pull` rewrites `.env.local`, so a value you only put in that file by hand is lost on the next pull. Without the variable, the admin area stays locked.

## Supplier API

Fulfillment suppliers can update an order's status from their own systems with `PATCH /api/orders/<number>/status`. They send the shared token from `SUPPLIER_API_TOKEN` as a bearer token:

```bash
curl -X PATCH https://<your-store>/api/orders/1001/status \
  -H "authorization: Bearer $SUPPLIER_API_TOKEN" \
  -H 'content-type: application/json' \
  -d '{"status":"shipped"}'
```

The status must be one of `processing`, `shipped`, `delivered`, or `cancelled`. Changes show up in `/admin/orders` and on the customer's order page.

## How it works

**The store** is a regular Next.js app: a product grid, product pages, a cookie-based cart, and a demo checkout that creates an order without taking payment. All data access goes through `lib/store.ts`. The database is only reachable from the server.

**Scout**, the assistant, is an Eve agent in its own repo, [scout-agent](https://github.com/buildswithcoffee/scout-agent), and its own Vercel project. For each message:

1. The chat drawer sends the message to `/api/agent/intent`, which asks Scout to classify it into one of seven intents (sizing, shipping, returns, and so on). Scout uses the AI SDK's [decide](https://ai-sdk.dev/docs/ai-sdk-core/decisions) with the `vmc/my-evaluation-models` virtual model on AI Gateway, which tries [jev](https://ai-sdk.dev/docs/ai-sdk-core/evaluation) first and falls back to luna-decisions and the rest of its chain.
2. Scout looks the intent up in its routing table. Each row sets the model, a fallback model, the reasoning effort, and an optional skill. The drawer shows the intent, and Scout runs the turn on that row's model.
3. The model loads the skill if there is one and answers using Scout's tools, which read the same Neon database as the store.

The drawer talks to Scout directly with a token that `/api/agent/session` signs for the shopper's cart. Scout takes the cart only from that token, never from the model, so the assistant can only see and change the current shopper's cart, and it refuses any request the store didn't sign.

Search uses the same virtual model for its fallback, from `lib/search-intent.ts` and `lib/evaluation-model.ts` here.

## Project layout

```
app/
  page.tsx                    Home: product grid with category filter
  products/[slug]/page.tsx    Product page
  search/page.tsx             Search results
  cart/page.tsx               Cart and demo checkout
  orders/[number]/page.tsx    Order confirmation
  admin/orders/page.tsx       Admin order list with status changes
  admin/login/page.tsx        Admin sign-in
  admin/actions.ts            Server actions for admin sign-in and status changes
  setup/page.tsx              Shown when DATABASE_URL is missing
  actions.ts                  Server actions for the cart and checkout
  api/agent/intent/route.ts   Asks Scout which intent a message has
  api/agent/session/route.ts  Signs the shopper's cart token for Scout
  api/search/intent/route.ts  The search fallback as JSON
  api/orders/[number]/status/route.ts  Supplier API for order status

components/
  agent/chat.tsx              Chat drawer
  header.tsx, product-card.tsx, setup.tsx

lib/
  db.ts                       Neon client; creates tables and seeds on first use
  store.ts                    Products, carts, orders, and search queries
  search-intent.ts            Evaluation-model fallback for search
  evaluation-model.ts         The virtual model every decide() call uses, and refusal handling
  admin-auth.ts               Admin password check and session cookie
  scout.ts, scout-url.ts      Where Scout runs, and the cart token it trusts
  cart-cookie.ts, format.ts

db/
  schema.ts                   Table definitions
  images.ts                   Generates the product SVGs (npm run db:images)
  reset.ts                    Drops all tables (npm run db:reset)

data/
  products.json               The catalog
  orders.json                 Demo orders
```

## Evals

Scout's evals, which check its goodwill credits, live with Scout in [scout-agent](https://github.com/buildswithcoffee/scout-agent).

## Environment variables

| Variable | Set by | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Neon integration | Postgres connection string |
| `SCOUT_STOREFRONT_SECRET` | You | Signs the cart token Scout trusts; the same value goes on Scout's project |
| `NEXT_PUBLIC_SCOUT_URL` | You (optional) | Scout's address, if not `https://scout-agent.verceldemo.com` |
| `VERCEL_OIDC_TOKEN` | Vercel | Authenticates to AI Gateway |
| `AI_GATEWAY_API_KEY` | You (optional) | Use an API key instead of OIDC |
| `ADMIN_PASSWORD` | You (optional) | Turns on the store admin at `/admin` |
| `SUPPLIER_API_TOKEN` | You (optional) | Shared token for the supplier API |

## Changing the catalog

The app only seeds when the products table is empty. After editing `data/products.json` or `data/orders.json`, drop the tables so the next request reseeds:

```bash
npm run db:reset
```

Run `npm run db:images` to regenerate product images for any new products.
