"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { checkPassword, endAdminSession, requireAdmin, startAdminSession } from "@/lib/admin-auth";
import { ORDER_STATUSES, updateOrderStatus, type OrderStatus } from "@/lib/store";

export async function signIn(formData: FormData) {
  if (!checkPassword(String(formData.get("password") ?? ""))) redirect("/admin/login?error=1");
  await startAdminSession();
  redirect("/admin/orders");
}

export async function signOut() {
  await endAdminSession();
  redirect("/admin/login");
}

export async function saveOrderStatus(formData: FormData) {
  await requireAdmin();
  const number = String(formData.get("number") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!ORDER_STATUSES.includes(status as OrderStatus)) return;
  await updateOrderStatus(number, status as OrderStatus);
  revalidatePath("/admin/orders");
  revalidatePath(`/orders/${number}`);
}
