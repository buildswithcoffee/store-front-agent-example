import Link from "next/link";

import { saveOrderStatus, signOut } from "@/app/admin/actions";
import { requireAdmin } from "@/lib/admin-auth";
import { formatPrice } from "@/lib/format";
import { listOrders, ORDER_STATUSES } from "@/lib/store";

export default async function AdminOrdersPage() {
  await requireAdmin();
  const orders = await listOrders();

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <div>
          <p className="text-sm text-neutral-500">Store admin</p>
          <h1 className="mt-1 text-2xl font-semibold">Orders</h1>
        </div>
        <form action={signOut}>
          <button type="submit" className="text-sm underline">
            Sign out
          </button>
        </form>
      </div>

      <div className="mt-6 overflow-x-auto rounded-2xl bg-white ring-1 ring-neutral-200">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-neutral-200 text-neutral-500">
            <tr>
              <th className="px-5 py-3 font-medium">Order</th>
              <th className="px-5 py-3 font-medium">Placed</th>
              <th className="px-5 py-3 font-medium">Email</th>
              <th className="px-5 py-3 font-medium">Items</th>
              <th className="px-5 py-3 text-right font-medium">Total</th>
              <th className="px-5 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200">
            {orders.map((order) => (
              <tr key={order.number} className="align-top">
                <td className="px-5 py-3">
                  <Link href={`/orders/${order.number}`} className="font-medium hover:underline">
                    #{order.number}
                  </Link>
                </td>
                <td className="whitespace-nowrap px-5 py-3">{order.placedAt}</td>
                <td className="px-5 py-3">{order.email}</td>
                <td className="px-5 py-3">
                  {order.items.map((item) => (
                    <div key={`${item.slug}:${item.variant}`}>
                      {item.quantity} × {item.name}
                      {item.variant && <span className="text-neutral-500"> · {item.variant}</span>}
                    </div>
                  ))}
                </td>
                <td className="px-5 py-3 text-right">
                  {formatPrice(order.items.reduce((sum, i) => sum + i.priceCents * i.quantity, 0))}
                </td>
                <td className="px-5 py-3">
                  {/* React resets a form after its action runs, which would put the select back
                      to the status it first rendered with. Keying on the status remounts the
                      form with the saved value instead. */}
                  <form key={order.status} action={saveOrderStatus} className="flex gap-2">
                    <input type="hidden" name="number" value={order.number} />
                    <select
                      name="status"
                      defaultValue={order.status}
                      aria-label={`Status for order ${order.number}`}
                      className="rounded-md border border-neutral-300 px-2 py-1"
                    >
                      {ORDER_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                    <button type="submit" className="rounded-md px-3 py-1 ring-1 ring-neutral-300 hover:bg-neutral-100">
                      Save
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
