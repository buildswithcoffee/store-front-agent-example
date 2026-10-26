// Batch advisories: production batches flagged for a known problem. NorthStar
// writes them through app/api/advisories; order lookups match them to line items
// by product and batch.
import { db } from "./db";

export interface Advisory {
  productSlug: string;
  batch: string;
  issue: string;
  remedy: string;
  internalNote: string;
  shopperMessage: string;
  createdBy: string;
  createdAt: string;
}

export interface NewAdvisory {
  productSlug: string;
  batch: string;
  issue: string;
  remedy: string;
  internalNote: string;
  shopperMessage: string;
  createdBy: string;
}

function toAdvisory(row: Record<string, unknown>): Advisory {
  return {
    productSlug: row.product_slug as string,
    batch: row.batch as string,
    issue: row.issue as string,
    remedy: row.remedy as string,
    internalNote: row.internal_note as string,
    shopperMessage: row.shopper_message as string,
    createdBy: row.created_by as string,
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

// Flagging the same batch again replaces its advisory.
export async function flagBatches(advisories: NewAdvisory[]): Promise<Advisory[]> {
  const sql = await db();
  const rows = await sql.query(
    `insert into batch_advisories (product_slug, batch, issue, remedy, internal_note, shopper_message, created_by)
     select product_slug, batch, issue, remedy, internal_note, shopper_message, created_by
     from jsonb_to_recordset($1::jsonb) as x(product_slug text, batch text, issue text, remedy text,
       internal_note text, shopper_message text, created_by text)
     on conflict (product_slug, batch) do update set
       issue = excluded.issue, remedy = excluded.remedy, internal_note = excluded.internal_note,
       shopper_message = excluded.shopper_message, created_by = excluded.created_by, created_at = now()
     returning *`,
    [
      JSON.stringify(
        advisories.map((a) => ({
          product_slug: a.productSlug,
          batch: a.batch,
          issue: a.issue,
          remedy: a.remedy,
          internal_note: a.internalNote,
          shopper_message: a.shopperMessage,
          created_by: a.createdBy,
        })),
      ),
    ],
  );
  return (rows as Record<string, unknown>[]).map(toAdvisory);
}

export async function listAdvisories(): Promise<Advisory[]> {
  const sql = await db();
  const rows = await sql`select * from batch_advisories order by created_at desc`;
  return rows.map(toAdvisory);
}

// Removes the given batches' advisories, or all of them when none are given.
export async function clearAdvisories(batches?: { productSlug: string; batch: string }[]): Promise<number> {
  const sql = await db();
  const rows = batches?.length
    ? await sql.query(
        `delete from batch_advisories a using jsonb_to_recordset($1::jsonb) as x(product_slug text, batch text)
         where a.product_slug = x.product_slug and a.batch = x.batch returning a.id`,
        [JSON.stringify(batches.map((b) => ({ product_slug: b.productSlug, batch: b.batch })))],
      )
    : await sql`delete from batch_advisories returning id`;
  return (rows as unknown[]).length;
}

// How many orders contain a line item from one of these batches.
export async function countOrdersWithBatches(batches: { productSlug: string; batch: string }[]): Promise<number> {
  const sql = await db();
  const [{ count }] = (await sql.query(
    `select count(distinct o.id)::int as count
     from orders o, jsonb_array_elements(o.items) item, jsonb_to_recordset($1::jsonb) as x(product_slug text, batch text)
     where item->>'slug' = x.product_slug and item->>'batch' = x.batch`,
    [JSON.stringify(batches.map((b) => ({ product_slug: b.productSlug, batch: b.batch })))],
  )) as { count: number }[];
  return count;
}
