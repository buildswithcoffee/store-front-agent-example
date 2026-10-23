// Data access for returns and compensation offers, shared by the agent's tools.
// The employee app reads the same tables and posts decisions to an offer's
// decision_url, which resumes the paused offer_compensation workflow.
import { db } from "./db";

export const RETURN_REASONS = ["damaged", "defective", "wrong_size", "changed_mind"] as const;
export type ReturnReason = (typeof RETURN_REASONS)[number];

export const RESOLUTIONS = ["refund", "replacement", "exchange"] as const;
export type Resolution = (typeof RESOLUTIONS)[number];

export interface Return {
  id: number;
  orderNumber: string;
  itemSlug: string;
  itemName: string;
  variant: string;
  quantity: number;
  reason: string;
  damageKind: string | null;
  resolution: string;
  status: string;
  photoNote: string | null;
}

export interface CompensationOffer {
  id: number;
  returnId: number;
  amountCents: number;
  reason: string;
  status: "pending" | "approved" | "declined";
  decidedBy: string | null;
}

export interface OfferDecision {
  decision: "approved" | "declined";
  decidedBy?: string;
}

function toReturn(row: Record<string, unknown>): Return {
  return {
    id: row.id as number,
    orderNumber: row.order_number as string,
    itemSlug: row.item_slug as string,
    itemName: row.item_name as string,
    variant: row.variant as string,
    quantity: row.quantity as number,
    reason: row.reason as string,
    damageKind: row.damage_kind as string | null,
    resolution: row.resolution as string,
    status: row.status as string,
    photoNote: row.photo_note as string | null,
  };
}

function toOffer(row: Record<string, unknown>): CompensationOffer {
  return {
    id: row.id as number,
    returnId: row.return_id as number,
    amountCents: row.amount_cents as number,
    reason: row.reason as string,
    status: row.status as CompensationOffer["status"],
    decidedBy: row.decided_by as string | null,
  };
}

export async function createReturn(input: {
  orderNumber: string;
  itemSlug: string;
  itemName: string;
  variant: string;
  quantity: number;
  reason: ReturnReason;
  damageKind?: string;
  resolution: Resolution;
  photoNote?: string;
}): Promise<Return> {
  const sql = await db();
  const [row] = await sql`
    insert into returns (order_number, item_slug, item_name, variant, quantity, reason, damage_kind, resolution, photo_note)
    values (${input.orderNumber}, ${input.itemSlug}, ${input.itemName}, ${input.variant}, ${input.quantity},
            ${input.reason}, ${input.damageKind ?? null}, ${input.resolution}, ${input.photoNote ?? null})
    returning *`;
  return toReturn(row);
}

// The most recent return for an item on an order. Tools address returns this way
// because models copy order numbers and product slugs reliably, but not row ids.
export async function findLatestReturn(orderNumber: string, itemSlug: string): Promise<Return | undefined> {
  const sql = await db();
  const [row] = await sql`
    select * from returns where order_number = ${orderNumber} and item_slug = ${itemSlug}
    order by id desc limit 1`;
  return row && toReturn(row);
}

// In `next dev`, workflow webhooks are served by eve's dev control server, not the
// Next.js port that createWebhook puts in the URL. Deployed, the app origin serves
// them and EVE_DEV_CONTROL_URL is unset, so the URL passes through unchanged.
function resolveDecisionUrl(decisionUrl: string): string {
  const control = process.env.EVE_DEV_CONTROL_URL;
  if (!control) return decisionUrl;
  const url = new URL(decisionUrl);
  const controlUrl = new URL(control);
  url.protocol = controlUrl.protocol;
  url.host = controlUrl.host;
  return url.toString();
}

export async function fileOffer(
  input: { returnId: number; amountCents: number; reason: string },
  decisionUrl: string,
  workflowRunId: string,
): Promise<CompensationOffer> {
  const sql = await db();
  const [row] = await sql`
    insert into compensation_offers (return_id, amount_cents, reason, decision_url, workflow_run_id)
    values (${input.returnId}, ${input.amountCents}, ${input.reason}, ${resolveDecisionUrl(decisionUrl)}, ${workflowRunId})
    returning *`;
  return toOffer(row);
}

export async function settleOffer(offerId: number, decision: OfferDecision): Promise<CompensationOffer> {
  const status = decision.decision === "approved" ? "approved" : "declined";
  const sql = await db();
  const [row] = await sql`
    update compensation_offers
    set status = ${status}, decided_by = ${decision.decidedBy ?? "Store associate"}, decided_at = now()
    where id = ${offerId} and status = 'pending'
    returning *`;
  if (!row) throw new Error(`Offer ${offerId} is not pending.`);
  return toOffer(row);
}
