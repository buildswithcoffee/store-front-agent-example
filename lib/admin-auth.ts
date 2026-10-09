// Next.js-only, like lib/cart-cookie.ts. The admin area has one shared password in
// ADMIN_PASSWORD. Signing in sets a cookie holding an HMAC derived from it, so the
// password itself never sits in the browser, and changing it signs everyone out.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const ADMIN_COOKIE = "admin_session";

// Without a password configured the admin area stays locked, rather than open.
export function adminConfigured(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD);
}

function sessionToken(password: string): string {
  return createHmac("sha256", password).update("northstar-admin-session").digest("hex");
}

// Hashing both sides first gives equal-length buffers, which timingSafeEqual requires.
function safeEqual(a: string, b: string): boolean {
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(digest(a), digest(b));
}

export function checkPassword(input: string): boolean {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return false;
  return safeEqual(input, password);
}

export async function isAdmin(): Promise<boolean> {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return false;
  const cookie = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!cookie) return false;
  return safeEqual(cookie, sessionToken(password));
}

// Call at the top of every admin page and every admin server action. Server actions
// are reachable by direct POST, so checking only on the page is not enough.
export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) redirect("/admin/login");
}

export async function startAdminSession(): Promise<void> {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return;
  (await cookies()).set(ADMIN_COOKIE, sessionToken(password), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/admin",
    maxAge: 60 * 60 * 8,
  });
}

export async function endAdminSession(): Promise<void> {
  (await cookies()).delete({ name: ADMIN_COOKIE, path: "/admin" });
}
