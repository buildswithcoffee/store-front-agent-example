// Applied automatically on the app's first request (see lib/db.ts).
// Every statement is idempotent, so running it again is harmless.
export const schema = [
  // Trigram similarity for typo-tolerant search. See findSimilarProducts in lib/store.ts.
  `create extension if not exists pg_trgm`,

  `create table if not exists products (
    id serial primary key,
    slug text unique not null,
    name text not null,
    category text not null,
    description text not null,
    price_cents integer not null,
    image text not null,
    options jsonb not null default '{}'
  )`,

  `create table if not exists carts (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now()
  )`,

  `create table if not exists cart_items (
    cart_id uuid not null references carts (id) on delete cascade,
    product_id integer not null references products (id),
    variant text not null default '',
    quantity integer not null check (quantity > 0),
    primary key (cart_id, product_id, variant)
  )`,

  `create table if not exists orders (
    id serial primary key,
    number text generated always as ((1000 + id)::text) stored,
    email text not null,
    status text not null,
    placed_at date not null,
    items jsonb not null
  )`,

  `create table if not exists returns (
    id serial primary key,
    order_number text not null,
    item_slug text not null,
    item_name text not null,
    variant text not null default '',
    quantity integer not null default 1 check (quantity > 0),
    reason text not null,
    damage_kind text,
    resolution text not null,
    status text not null default 'started',
    photo_note text,
    created_at timestamptz not null default now()
  )`,

  // One pending offer per return. The offer_compensation workflow writes the row,
  // parks on decision_url, and settles it when an associate posts a decision.
  `create table if not exists compensation_offers (
    id serial primary key,
    return_id integer not null references returns (id) on delete cascade,
    amount_cents integer not null check (amount_cents > 0),
    reason text not null,
    status text not null default 'pending',
    decision_url text not null,
    decided_by text,
    decided_at timestamptz,
    created_at timestamptz not null default now()
  )`,

  // The offer_compensation run that owns the offer, so the employee app can link
  // straight to it in the Vercel Workflows dashboard.
  `alter table compensation_offers add column if not exists workflow_run_id text`,

  // amount_cents stays the agent's original proposal. Associates record changes as
  // offer_adjustments rows (the audit trail), and approval stores the amount granted.
  `alter table compensation_offers add column if not exists approved_amount_cents integer`,

  `create table if not exists offer_adjustments (
    id serial primary key,
    offer_id integer not null references compensation_offers (id) on delete cascade,
    amount_cents integer not null check (amount_cents > 0),
    note text not null,
    adjusted_by text not null,
    created_at timestamptz not null default now()
  )`,

  // The Trail Shell Jacket now also comes in Burgundy. The catalog only seeds into an
  // empty table, so databases seeded before the color existed get it here.
  `update products set options = jsonb_set(options, '{Color}', (options -> 'Color') || '["Burgundy"]'::jsonb)
    where slug = 'trail-shell-jacket' and not (options -> 'Color') @> '["Burgundy"]'::jsonb`,
];
