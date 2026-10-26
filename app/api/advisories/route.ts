import { createHash, timingSafeEqual } from "node:crypto";

import { z } from "zod";

import { clearAdvisories, countOrdersWithBatches, flagBatches, listAdvisories } from "@/lib/advisories";

// Batch advisories for internal systems: NorthStar flags a bad production batch
// here after a person approves it in Slack. Callers authenticate with the shared
// key in ADVISORIES_API_KEY, which NorthStar holds through Vercel Connect.
// Try: curl localhost:3000/api/advisories -H "authorization: Bearer $ADVISORIES_API_KEY"

const batchRef = z.object({ productSlug: z.string().min(1), batch: z.string().min(1) });
const flagBody = z.object({
  advisories: z
    .array(
      batchRef.extend({
        issue: z.string().min(1),
        remedy: z.string().min(1),
        internalNote: z.string().min(1),
        shopperMessage: z.string().min(1),
        createdBy: z.string().min(1),
      }),
    )
    .min(1),
});
const clearBody = z.object({ batches: z.array(batchRef).optional() });

// Refuses everything when no key is configured.
function authorized(request: Request): boolean {
  const key = process.env.ADVISORIES_API_KEY;
  const presented = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!key || !presented) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(presented), digest(key));
}

const unauthorized = () => Response.json({ error: "Invalid advisories key." }, { status: 401 });

export async function GET(request: Request) {
  if (!authorized(request)) return unauthorized();
  return Response.json({ advisories: await listAdvisories() });
}

// Flags batches and reports how many orders they cover.
export async function POST(request: Request) {
  if (!authorized(request)) return unauthorized();
  const parsed = flagBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: z.prettifyError(parsed.error) }, { status: 400 });

  const advisories = await flagBatches(parsed.data.advisories);
  const affectedOrders = await countOrdersWithBatches(parsed.data.advisories);
  return Response.json({ advisories, affectedOrders }, { status: 201 });
}

// Clears the given batches' advisories, or all of them (the demo reset).
export async function DELETE(request: Request) {
  if (!authorized(request)) return unauthorized();
  const parsed = clearBody.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  return Response.json({ cleared: await clearAdvisories(parsed.data.batches) });
}
