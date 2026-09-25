import { cookies } from "next/headers";

import { db } from "./db";

export interface Product {
  id: number;
  slug: string;
  name: string;
  category: string;
  description: string;
  priceCents: number;
  image: string;
  options: Record<string, string[]>;
}

export interface CartLine {
  product: Product;
  variant: string;
  quantity: number;
}

export interface OrderItem {
  slug: string;
  name: string;
  variant: string;
  quantity: number;
  priceCents: number;
}

export interface Order {
  number: string;
  email: string;
  status: string;
  placedAt: string;
  items: OrderItem[];
}

const CART_COOKIE = "cart_id";

function toProduct(row: Record<string, unknown>): Product {
  return {
    id: row.id as number,
    slug: row.slug as string,
    name: row.name as string,
    category: row.category as string,
    description: row.description as string,
    priceCents: row.price_cents as number,
    image: row.image as string,
    options: row.options as Record<string, string[]>,
  };
}

// The driver returns `date` columns as JS Dates at local midnight.
function isoDate(value: unknown): string {
  const d = value instanceof Date ? value : new Date(String(value));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toOrder(row: Record<string, unknown>): Order {
  return {
    number: row.number as string,
    email: row.email as string,
    status: row.status as string,
    placedAt: isoDate(row.placed_at),
    items: row.items as OrderItem[],
  };
}

// Catalog

export async function getProducts(category?: string): Promise<Product[]> {
  const sql = await db();
  const rows = category
    ? await sql`select * from products where category = ${category} order by id`
    : await sql`select * from products order by id`;
  return rows.map(toProduct);
}

export async function getProduct(slug: string): Promise<Product | undefined> {
  const sql = await db();
  const [row] = await sql`select * from products where slug = ${slug}`;
  return row && toProduct(row);
}

export async function getCategories(): Promise<string[]> {
  const sql = await db();
  const rows = await sql`select distinct category from products order by category`;
  return rows.map((r) => r.category as string);
}

// Cart. The cart id lives in a cookie; nothing else identifies the shopper.

export async function getCartId(): Promise<string | undefined> {
  return (await cookies()).get(CART_COOKIE)?.value;
}

export async function getOrCreateCartId(): Promise<string> {
  const existing = await getCartId();
  if (existing) return existing;
  const sql = await db();
  const [{ id }] = await sql`insert into carts default values returning id`;
  (await cookies()).set(CART_COOKIE, id, { httpOnly: true, sameSite: "lax", path: "/" });
  return id;
}

export async function getCart(cartId?: string): Promise<CartLine[]> {
  if (!cartId) return [];
  const sql = await db();
  const rows = await sql`
    select p.*, ci.variant, ci.quantity
    from cart_items ci join products p on p.id = ci.product_id
    where ci.cart_id = ${cartId}
    order by p.name, ci.variant`;
  return rows.map((row) => ({
    product: toProduct(row),
    variant: row.variant as string,
    quantity: row.quantity as number,
  }));
}

export async function getCartCount(cartId?: string): Promise<number> {
  if (!cartId) return 0;
  const sql = await db();
  const [{ count }] =
    await sql`select coalesce(sum(quantity), 0)::int as count from cart_items where cart_id = ${cartId}`;
  return count;
}

export async function addCartItem(cartId: string, productId: number, variant: string, quantity = 1) {
  const sql = await db();
  await sql`
    insert into cart_items (cart_id, product_id, variant, quantity)
    values (${cartId}, ${productId}, ${variant}, ${quantity})
    on conflict (cart_id, product_id, variant)
    do update set quantity = cart_items.quantity + excluded.quantity`;
}

export async function setCartItemQuantity(cartId: string, productId: number, variant: string, quantity: number) {
  const sql = await db();
  if (quantity <= 0) {
    await sql`delete from cart_items where cart_id = ${cartId} and product_id = ${productId} and variant = ${variant}`;
  } else {
    await sql`update cart_items set quantity = ${quantity}
              where cart_id = ${cartId} and product_id = ${productId} and variant = ${variant}`;
  }
}

export async function clearCart(cartId: string) {
  const sql = await db();
  await sql`delete from cart_items where cart_id = ${cartId}`;
}

// Orders

export async function createOrder(email: string, lines: CartLine[]): Promise<Order> {
  const sql = await db();
  const items: OrderItem[] = lines.map((l) => ({
    slug: l.product.slug,
    name: l.product.name,
    variant: l.variant,
    quantity: l.quantity,
    priceCents: l.product.priceCents,
  }));
  const [row] = await sql`
    insert into orders (email, status, placed_at, items)
    values (${email}, 'processing', current_date, ${JSON.stringify(items)}::jsonb)
    returning *`;
  return toOrder(row);
}

export async function getOrder(number: string, email?: string): Promise<Order | undefined> {
  const sql = await db();
  const rows = email
    ? await sql`select * from orders where number = ${number} and lower(email) = lower(${email})`
    : await sql`select * from orders where number = ${number}`;
  return rows[0] && toOrder(rows[0]);
}

export function cartTotal(lines: CartLine[]): number {
  return lines.reduce((sum, l) => sum + l.product.priceCents * l.quantity, 0);
}
