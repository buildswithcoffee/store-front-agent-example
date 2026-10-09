import { redirect } from "next/navigation";

import { signIn } from "@/app/admin/actions";
import { adminConfigured, isAdmin } from "@/lib/admin-auth";

export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await isAdmin()) redirect("/admin/orders");
  const { error } = await searchParams;

  return (
    <div className="mx-auto max-w-sm py-8">
      <p className="text-sm text-neutral-500">Northstar Goods</p>
      <h1 className="mt-1 text-2xl font-semibold">Store admin</h1>
      {adminConfigured() ? (
        <form action={signIn} className="mt-6 space-y-3">
          <input
            type="password"
            name="password"
            required
            autoFocus
            placeholder="Admin password"
            aria-label="Admin password"
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
          />
          {error && <p className="text-sm text-red-600">That password is not right.</p>}
          <button type="submit" className="w-full rounded-lg bg-neutral-900 px-4 py-3 text-sm font-medium text-white hover:bg-neutral-800">
            Sign in
          </button>
        </form>
      ) : (
        <p className="mt-6 text-sm text-neutral-700">
          The admin area is turned off until <code>ADMIN_PASSWORD</code> is set.
        </p>
      )}
    </div>
  );
}
