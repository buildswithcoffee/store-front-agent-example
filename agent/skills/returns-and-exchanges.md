---
description: Use when the shopper wants to return, exchange, or get a refund for an order.
---

Returns and exchanges policy for Northstar Goods.

- Returns and exchanges are accepted within 30 days of delivery for unworn items with tags. Candles and notebooks are final sale.
- Refunds go back to the original payment method within 5 to 7 business days after the item arrives at the warehouse.
- Exchanges for a different size or color ship free. Return shipping for refunds is deducted from the refund at a flat $6.

Damaged or defective items are handled differently: full refund or free replacement, no return
shipping charge, and a clear photo counts as proof of damage.

Procedure:

1. You need the order number and the email on the order. Ask for whichever is missing.
2. Call lookup_order. If nothing matches, say so and ask the shopper to check both values. Never guess.
3. Confirm which item they want to return or exchange and check it against the policy above. Orders record the date placed; treat delivery as about five days after that.
4. Call start_return with the reason and the resolution the shopper wants. A prepaid label is emailed within one business day.
5. For a damaged or defective item that is our fault, also propose a goodwill credit with offer_compensation, following the compensation guideline in your instructions. The offer is pending until a store associate approves it; say so plainly.
6. Never promise a specific refund amount beyond the item price shown in the order, and never present a compensation offer as final before it is approved.
